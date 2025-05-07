import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PullRequest } from './schemas/pull-request.schema';
import { Commit } from './schemas/commit.schema';
import { UserService } from './user.service';
import { DateFilterDto } from './dto/date-filter.dto';
import { DiscordService } from './discord.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class GitHubWebhookService {
  constructor(
    @InjectModel(PullRequest.name)
    private pullRequestModel: Model<PullRequest>,
    @InjectModel(Commit.name)
    private commitModel: Model<Commit>,
    private userService: UserService,
    private discordService: DiscordService,
    private configService: ConfigService,
  ) {}

  async handleWebhookEvent(payload: any) {
    try {
      if (!payload) {
        throw new Error(
          'Invalid webhook payload: payload is null or undefined',
        );
      }

      // Check if it's a push event
      if (payload.commits) {
        return this.handlePushEvent(payload);
      }

      // If it's a synchronize action in PR event, handle as commit
      if (payload.action === 'synchronize') {
        const { pull_request: pr, repository, after } = payload;

        // Create commit record for the new head commit
        const author = await this.userService.findOrCreateUser(pr?.user);
        const commitData = {
          sha: after,
          node_id: pr?.head?.node_id,
          author: author?._id,
          message: `New commit on PR #${pr?.number}: ${pr?.title}`,
          url: `${repository?.url}/commits/${after}`,
          html_url: `${repository?.html_url}/commit/${after}`,
          comments_url: `${repository?.html_url}/commit/${after}/comments`,
          repository: {
            id: repository?.id,
            node_id: repository?.node_id,
            name: repository?.name,
            full_name: repository?.full_name,
            private: repository?.private,
          },
          branch: pr?.head?.ref,
          added: [],
          removed: [],
          modified: [],
          created_at: new Date(),
          stats: {
            // Use the total commits count from PR payload instead of hardcoding 1
            total: pr?.commits || 1,
            additions: 0,
            deletions: 0,
          },
        };

        await this.commitModel.create(commitData);
      }

      // Handle as PR event
      if (!payload.pull_request || !payload.repository) {
        throw new Error(
          'Invalid PR event payload: missing pull_request or repository',
        );
      }
      return this.handlePullRequestEvent(payload);
    } catch (error) {
      console.error('Error handling webhook event:', error);
      throw error;
    }
  }

  private async handlePullRequestEvent(payload: any) {
    const { action, pull_request: pr, repository } = payload;

    // First, handle the user
    const user = await this.userService.findOrCreateUser(pr?.user);
    console.log('PR Creator:', {
      githubId: pr?.user?.id,
      mongoId: user?._id,
      login: pr?.user?.login,
    });
    // If it's a new PR (opened action), create commit records for initial commits
    if (action === 'opened' && pr?.commits > 0) {
      const commitCount = pr?.commits || 0;
      console.log(
        `Creating ${commitCount} commit records for PR #${pr?.number}`,
      );

      // Create individual commit records for each commit in the PR
      for (let i = 0; i < commitCount; i++) {
        const commitData = {
          sha: i === commitCount - 1 ? pr?.head?.sha : `${pr?.head?.sha}-${i}`, // Use actual SHA for last commit
          node_id:
            i === commitCount - 1
              ? pr?.head?.node_id
              : `${pr?.head?.node_id}-${i}`,
          author: user?._id,
          message:
            i === commitCount - 1
              ? `Commit #${i + 1} (Head) on PR #${pr?.number}: ${pr?.title}`
              : `Commit #${i + 1} on PR #${pr?.number}: ${pr?.title}`,
          url: `${repository?.url}/commits/${pr?.head?.sha}`,
          html_url: `${repository?.html_url}/commit/${pr?.head?.sha}`,
          comments_url: `${repository?.html_url}/commit/${pr?.head?.sha}/comments`,
          repository: {
            id: repository?.id,
            node_id: repository?.node_id,
            name: repository?.name,
            full_name: repository?.full_name,
            private: repository?.private,
          },
          branch: pr?.head?.ref,
          added: [],
          removed: [],
          modified: [],
          created_at: new Date(
            new Date().getTime() - (commitCount - i - 1) * 60000,
          ), // Stagger timestamps
          stats: {
            total: 1, // Each record represents 1 commit
            additions: Math.floor((pr?.additions || 0) / commitCount), // Distribute additions
            deletions: Math.floor((pr?.deletions || 0) / commitCount), // Distribute deletions
          },
        };
        await this.commitModel.create(commitData);
      }
    }

    // Handle merged_by user if PR is merged
    let merged_by = null;
    if (pr?.merged && pr?.merged_by) {
      merged_by = await this.userService.findOrCreateUser(pr.merged_by);
      console.log('PR Merger:', {
        githubId: pr?.merged_by?.id,
        mongoId: merged_by?._id,
        login: pr?.merged_by?.login,
      });
    }

    const pullRequestData = {
      prNumber: pr?.number,
      node_id: pr?.node_id,
      title: pr?.title,
      state: pr?.state,
      locked: pr?.locked,
      user: user?._id,
      merged_by: merged_by?._id,
      body: pr?.body,
      url: pr?.url,
      html_url: pr?.html_url,
      diff_url: pr?.diff_url,
      patch_url: pr?.patch_url,
      issue_url: pr?.issue_url,
      created_at: pr?.created_at ? new Date(pr.created_at) : undefined,
      updated_at: pr?.updated_at ? new Date(pr.updated_at) : undefined,
      closed_at: pr?.closed_at ? new Date(pr.closed_at) : undefined,
      merged_at: pr?.merged_at ? new Date(pr.merged_at) : undefined,
      merge_commit_sha: pr?.merge_commit_sha,
      merged: pr?.merged || false,
      mergeable: pr?.mergeable,
      rebaseable: pr?.rebaseable,
      mergeable_state: pr?.mergeable_state,
      head: {
        label: pr?.head?.label,
        ref: pr?.head?.ref,
        sha: pr?.head?.sha,
      },
      base: {
        label: pr?.base?.label,
        ref: pr?.base?.ref,
        sha: pr?.base?.sha,
      },
      repository: {
        id: repository?.id,
        node_id: repository?.node_id,
        name: repository?.name,
        full_name: repository?.full_name,
        private: repository?.private,
      },
    };

    if (action === 'opened') {
      // Send Discord notification for new PR
      await this.discordService.sendPROpenedNotification(payload);
      return await this.pullRequestModel.create(pullRequestData);
    } else if (action === 'closed') {
      // First check if PR exists
      const existingPR = await this.pullRequestModel.findOne({
        prNumber: pr?.number,
        'repository.full_name': repository?.full_name,
      });
      if (!existingPR) {
        console.warn(
          `Received ${action} event for non-existent PR #${pr?.number} in ${repository?.full_name}`,
        );
        // Create the PR if it doesn't exist, but log a warning
        return await this.pullRequestModel.create(pullRequestData);
      }

      // Send Discord notification for closed PR if it was merged
      if (action === 'closed') {
        await this.discordService.sendPRClosedNotification(payload);
      }

      // Update existing PR
      const updatedPR = await this.pullRequestModel.findOneAndUpdate(
        {
          prNumber: pr?.number,
          'repository.full_name': repository?.full_name,
        },
        pullRequestData,
        { new: true },
      );

      console.log(`PR #${pr?.number} ${action}:`, {
        repository: repository?.full_name,
        oldState: existingPR.state,
        newState: updatedPR.state,
        action,
      });

      return updatedPR;
    }
  }

  private async handlePushEvent(payload: any) {
    const { repository, commits, ref } = payload;
    const branch = ref?.replace('refs/heads/', '');

    const savedCommits = [];
    for (const commit of commits || []) {
      // Get or create user for commit author
      const author = await this.userService.findOrCreateUser(commit?.author);

      const commitData = {
        sha: commit?.id,
        node_id: commit?.node_id,
        author: author?._id,
        message: commit?.message,
        url: commit?.url,
        html_url: `${repository?.html_url}/commit/${commit?.id}`,
        comments_url: `${repository?.html_url}/commit/${commit?.id}/comments`,
        repository: {
          id: repository?.id,
          node_id: repository?.node_id,
          name: repository?.name,
          full_name: repository?.full_name,
          private: repository?.private,
        },
        branch,
        added: commit?.added || [],
        removed: commit?.removed || [],
        modified: commit?.modified || [],
        created_at: commit?.timestamp ? new Date(commit.timestamp) : new Date(),
        stats: {
          total:
            (commit?.added?.length || 0) +
            (commit?.removed?.length || 0) +
            (commit?.modified?.length || 0),
          additions: commit?.added?.length || 0,
          deletions: commit?.removed?.length || 0,
        },
      };

      const savedCommit = await this.commitModel.create(commitData);
      savedCommits.push(savedCommit);
    }

    return savedCommits;
  }

  async getAllPullRequests() {
    return await this.pullRequestModel
      .find()
      .populate('user')
      .sort({ created_at: -1 });
  }

  private getDateFilter(dateFilter?: DateFilterDto) {
    if (!dateFilter?.startDate && !dateFilter?.endDate) {
      // Set default date range: last 7 days
      const endDate = new Date(); // today
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7); // 7 days ago

      return {
        $or: [
          {
            created_at: {
              $gte: startDate,
              $lte: new Date(endDate.setHours(23, 59, 59, 999)),
            },
          },
          {
            closed_at: {
              $gte: startDate,
              $lte: new Date(endDate.setHours(23, 59, 59, 999)),
            },
          },
          {
            merged_at: {
              $gte: startDate,
              $lte: new Date(endDate.setHours(23, 59, 59, 999)),
            },
          },
        ],
      };
    }

    // If dates are provided, use them
    const startDate = dateFilter?.startDate
      ? new Date(dateFilter.startDate)
      : null;
    const endDate = dateFilter?.endDate ? new Date(dateFilter.endDate) : null;

    if (startDate && endDate) {
      return {
        $or: [
          {
            created_at: {
              $gte: startDate,
              $lte: new Date(endDate.setHours(23, 59, 59, 999)),
            },
          },
          {
            closed_at: {
              $gte: startDate,
              $lte: new Date(endDate.setHours(23, 59, 59, 999)),
            },
          },
          {
            merged_at: {
              $gte: startDate,
              $lte: new Date(endDate.setHours(23, 59, 59, 999)),
            },
          },
        ],
      };
    }

    if (startDate) {
      return {
        $or: [
          { created_at: { $gte: startDate } },
          { closed_at: { $gte: startDate } },
          { merged_at: { $gte: startDate } },
        ],
      };
    }

    if (endDate) {
      return {
        $or: [
          { created_at: { $lte: new Date(endDate.setHours(23, 59, 59, 999)) } },
          { closed_at: { $lte: new Date(endDate.setHours(23, 59, 59, 999)) } },
          { merged_at: { $lte: new Date(endDate.setHours(23, 59, 59, 999)) } },
        ],
      };
    }

    return {};
  }

  private getDateRange(dateFilter: DateFilterDto) {
    let endDate: Date;
    let startDate: Date;

    if (dateFilter?.endDate) {
      endDate = new Date(dateFilter.endDate);
      endDate.setHours(23, 59, 59, 999);
    } else {
      endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
    }

    if (dateFilter?.startDate) {
      startDate = new Date(dateFilter.startDate);
      startDate.setHours(0, 0, 0, 0);
    } else {
      startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
    }

    return { startDate, endDate };
  }

  async getOpenPRs(dateFilter: DateFilterDto) {
    const dateQuery = this.getDateFilter(dateFilter);

    const openPRs = await this.pullRequestModel.aggregate([
      {
        $match: {
          state: 'open',
          ...dateQuery,
        },
      },
      {
        $group: {
          _id: '$repository.full_name',
          totalOpenPRs: { $sum: 1 },
          prs: {
            $push: {
              prNumber: '$prNumber',
              title: '$title',
              created_at: '$created_at',
              user: '$user',
              html_url: '$html_url',
              head: '$head',
              base: '$base',
              repository: '$repository', // Add repository info to each PR
            },
          },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'prs.user',
          foreignField: '_id',
          as: 'users',
        },
      },
      {
        $sort: { totalOpenPRs: -1 },
      },
    ]);

    return {
      totalOpenPRs: await this.pullRequestModel.countDocuments({
        state: 'open',
        ...dateQuery,
      }),
      repositories: openPRs,
    };
  }

  async getClosedPRs(dateFilter: DateFilterDto) {
    const dateQuery = this.getDateFilter(dateFilter);

    const closedPRs = await this.pullRequestModel.aggregate([
      {
        $match: {
          state: 'closed',
          ...dateQuery,
        },
      },
      {
        $group: {
          _id: '$repository.full_name',
          totalClosedPRs: { $sum: 1 },
          mergedPRs: {
            $sum: { $cond: [{ $eq: ['$merged', true] }, 1, 0] },
          },
          prs: {
            $push: {
              prNumber: '$prNumber',
              title: '$title',
              html_url: '$html_url',
              repository: '$repository',
              created_at: '$created_at',
              closed_at: '$closed_at',
              merged: '$merged',
              user: '$user',
              merged_by: '$merged_by',
              head: '$head',
              base: '$base',
            },
          },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'prs.user',
          foreignField: '_id',
          as: 'creators',
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'prs.merged_by',
          foreignField: '_id',
          as: 'closers',
        },
      },
      {
        $addFields: {
          prs: {
            $map: {
              input: '$prs',
              as: 'pr',
              in: {
                $mergeObjects: [
                  '$$pr',
                  {
                    creator: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: '$creators',
                            as: 'creator',
                            cond: {
                              $eq: ['$$creator._id', '$$pr.user'],
                            },
                          },
                        },
                        0,
                      ],
                    },
                    closer: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: '$closers',
                            as: 'closer',
                            cond: {
                              $eq: ['$$closer._id', '$$pr.merged_by'],
                            },
                          },
                        },
                        0,
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 1,
          totalClosedPRs: 1,
          mergedPRs: 1,
          prs: {
            prNumber: 1,
            title: 1,
            html_url: 1,
            repository: 1,
            created_at: 1,
            closed_at: 1,
            merged: 1,
            head: 1,
            base: 1,
            creator: {
              _id: 1,
              login: 1,
              avatar_url: 1,
            },
            closer: {
              _id: 1,
              login: 1,
              avatar_url: 1,
            },
          },
        },
      },
      {
        $sort: { totalClosedPRs: -1 },
      },
    ]);

    return {
      totalClosedPRs: await this.pullRequestModel.countDocuments({
        state: 'closed',
        ...dateQuery,
      }),
      repositories: closedPRs,
    };
  }

  async getPRStatistics(dateFilter?: DateFilterDto) {
    // If no dateFilter provided, set default to last 7 days
    if (!dateFilter?.startDate && !dateFilter?.endDate) {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      dateFilter = {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      };
    }

    const { startDate, endDate } = this.getDateRange(dateFilter);

    // Count PRs created in date range (regardless of current state)
    const createdInRange = await this.pullRequestModel.countDocuments({
      $or: [
        { created_at: { $gte: startDate, $lte: endDate } },
        { closed_at: { $gte: startDate, $lte: endDate } },
        { merged_at: { $gte: startDate, $lte: endDate } },
      ],
    });

    // Count currently open PRs that were either:
    // - Created in range
    // - Had activity in range
    const openPRs = await this.pullRequestModel.countDocuments({
      state: 'open',
      $or: [
        { created_at: { $gte: startDate, $lte: endDate } },
        { updated_at: { $gte: startDate, $lte: endDate } },
      ],
    });

    // Count PRs closed in range
    const closedInRange = await this.pullRequestModel.countDocuments({
      state: 'closed',
      closed_at: {
        $gte: startDate,
        $lte: endDate,
      },
    });

    // Count PRs merged in range
    const mergedInRange = await this.pullRequestModel.countDocuments({
      merged: true,
      merged_at: {
        $gte: startDate,
        $lte: endDate,
      },
    });

    // Get detailed PR activity by day
    const prActivity = await this.pullRequestModel.aggregate([
      {
        $facet: {
          createdByDay: [
            {
              $match: {
                $or: [
                  { created_at: { $gte: startDate, $lte: endDate } },
                  { closed_at: { $gte: startDate, $lte: endDate } },
                  { merged_at: { $gte: startDate, $lte: endDate } },
                ],
              },
            },
            {
              $group: {
                _id: {
                  $dateToString: { format: '%Y-%m-%d', date: '$created_at' },
                },
                count: { $sum: 1 },
                prs: {
                  $push: {
                    prNumber: '$prNumber',
                    title: '$title',
                    html_url: '$html_url',
                    repository: '$repository',
                  },
                },
              },
            },
            { $sort: { _id: 1 } },
          ],
          closedByDay: [
            {
              $match: {
                state: 'closed',
                closed_at: {
                  $gte: startDate,
                  $lte: endDate,
                },
              },
            },
            {
              $group: {
                _id: {
                  $dateToString: { format: '%Y-%m-%d', date: '$closed_at' },
                },
                count: { $sum: 1 },
                prs: {
                  $push: {
                    prNumber: '$prNumber',
                    title: '$title',
                    html_url: '$html_url',
                    repository: '$repository',
                  },
                },
              },
            },
            { $sort: { _id: 1 } },
          ],
          mergedByDay: [
            {
              $match: {
                merged: true,
                merged_at: {
                  $gte: startDate,
                  $lte: endDate,
                },
              },
            },
            {
              $group: {
                _id: {
                  $dateToString: { format: '%Y-%m-%d', date: '$merged_at' },
                },
                count: { $sum: 1 },
                prs: {
                  $push: {
                    prNumber: '$prNumber',
                    title: '$title',
                    html_url: '$html_url',
                    repository: '$repository',
                  },
                },
              },
            },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ]);

    return {
      summary: {
        createdInRange,
        openPRs,
        closedInRange,
        mergedInRange,
        dateRange: {
          startDate,
          endDate,
        },
      },
      activity: prActivity[0],
    };
  }

  async getPRsByRepository(dateFilter?: DateFilterDto) {
    const dateQuery = this.getDateFilter(dateFilter);

    return await this.pullRequestModel.aggregate([
      {
        $match: dateQuery,
      },
      {
        $group: {
          _id: '$repository.full_name',
          totalPRs: { $sum: 1 },
          openPRs: {
            $sum: { $cond: [{ $eq: ['$state', 'open'] }, 1, 0] },
          },
          closedPRs: {
            $sum: { $cond: [{ $eq: ['$state', 'closed'] }, 1, 0] },
          },
          mergedPRs: {
            $sum: { $cond: [{ $eq: ['$merged', true] }, 1, 0] },
          },
        },
      },
      {
        $sort: { totalPRs: -1 },
      },
    ]);
  }

  async getCommitsByDate(dateFilter: DateFilterDto) {
    const dateQuery = this.getDateFilter(dateFilter);

    const commits = await this.commitModel.aggregate([
      {
        $match: dateQuery,
      },
      {
        $group: {
          _id: '$repository.full_name',
          totalCommits: { $sum: 1 },
          totalAdditions: { $sum: '$stats.additions' },
          totalDeletions: { $sum: '$stats.deletions' },
          commits: {
            $push: {
              sha: '$sha',
              message: '$message',
              author: '$author',
              created_at: '$created_at',
              branch: '$branch',
              html_url: '$html_url',
              stats: '$stats',
            },
          },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'commits.author',
          foreignField: '_id',
          as: 'authors',
        },
      },
      {
        $sort: { totalCommits: -1 },
      },
    ]);

    return {
      totalCommits: await this.commitModel.countDocuments(dateQuery),
      repositories: commits,
    };
  }

  async getCommitStatistics() {
    const [totalCommits, totalAuthors] = await Promise.all([
      this.commitModel.countDocuments(),
      this.commitModel.distinct('author').then((authors) => authors.length),
    ]);

    const commitsByAuthor = await this.commitModel.aggregate([
      {
        $group: {
          _id: '$author',
          totalCommits: { $sum: 1 },
          totalAdditions: { $sum: '$stats.additions' },
          totalDeletions: { $sum: '$stats.deletions' },
          repositories: { $addToSet: '$repository.full_name' },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'author',
        },
      },
      {
        $unwind: '$author',
      },
      {
        $sort: { totalCommits: -1 },
      },
    ]);

    const commitsByRepository = await this.commitModel.aggregate([
      {
        $group: {
          _id: '$repository.full_name',
          totalCommits: { $sum: 1 },
          totalAdditions: { $sum: '$stats.additions' },
          totalDeletions: { $sum: '$stats.deletions' },
          branches: { $addToSet: '$branch' },
          authors: { $addToSet: '$author' },
        },
      },
      {
        $sort: { totalCommits: -1 },
      },
    ]);

    return {
      summary: {
        totalCommits,
        totalAuthors,
      },
      commitsByAuthor,
      commitsByRepository,
    };
  }

  async getSelfMergedPRs(dateFilter: DateFilterDto) {
    const dateQuery = this.getDateFilter(dateFilter);
    console.log('Date Query:', dateQuery);

    // First get all PRs that match our basic criteria
    const initialMatch = await this.pullRequestModel
      .find({
        ...dateQuery,
        state: 'closed',
        merged: true,
      })
      .populate(['user', 'merged_by']);

    console.log('Initial Match Count:', initialMatch.length);
    console.log(
      'Initial PRs:',
      initialMatch.map((pr) => ({
        prNumber: pr.prNumber,
        user:
          pr.user && typeof pr.user === 'object'
            ? {
                githubId: pr.user.githubId,
                login: pr.user.login,
              }
            : pr.user,
        merged_by:
          pr.merged_by && typeof pr.merged_by === 'object'
            ? {
                githubId: pr.merged_by.githubId,
                login: pr.merged_by.login,
              }
            : pr.merged_by,
        created_at: pr.created_at,
        merged_at: pr.merged_at,
      })),
    );

    const selfMergedPRs = await this.pullRequestModel.aggregate([
      {
        $match: {
          ...dateQuery,
          state: 'closed',
          merged: true,
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'user',
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'merged_by',
          foreignField: '_id',
          as: 'merged_by',
        },
      },
      {
        $match: {
          'user.0': { $exists: true },
          'merged_by.0': { $exists: true },
        },
      },
      {
        $unwind: '$user',
      },
      {
        $unwind: '$merged_by',
      },
      {
        $match: {
          $expr: {
            $eq: ['$user.githubId', '$merged_by.githubId'],
          },
        },
      },
      {
        $group: {
          _id: '$user._id',
          user: { $first: '$user' },
          totalSelfMerges: { $sum: 1 },
          pullRequests: {
            $push: {
              prNumber: '$prNumber',
              title: '$title',
              html_url: '$html_url',
              repository: '$repository',
              created_at: '$created_at',
              merged_at: '$merged_at',
            },
          },
        },
      },
      {
        $sort: { totalSelfMerges: -1 },
      },
    ]);

    console.log('Self Merged PRs:', JSON.stringify(selfMergedPRs, null, 2));

    return {
      totalSelfMergedPRs: selfMergedPRs.reduce(
        (acc, curr) => acc + curr.totalSelfMerges,
        0,
      ),
      users: selfMergedPRs,
    };
  }

  async cleanupDuplicatePRs() {
    const duplicates = await this.pullRequestModel.aggregate([
      {
        $group: {
          _id: {
            prNumber: '$prNumber',
            repository: '$repository.full_name',
          },
          count: { $sum: 1 },
          docs: { $push: '$$ROOT' },
        },
      },
      {
        $match: {
          count: { $gt: 1 },
        },
      },
    ]);

    let cleanedCount = 0;
    for (const duplicate of duplicates) {
      const docs = duplicate.docs;
      // Sort by updated_at descending to keep the most recent one
      docs.sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      );

      // Keep the most recent one, delete others
      const [keep, ...remove] = docs;
      const removeIds = remove.map((doc) => doc._id);

      await this.pullRequestModel.deleteMany({ _id: { $in: removeIds } });
      cleanedCount += removeIds.length;

      console.log(
        `Cleaned up ${removeIds.length} duplicate(s) for PR #${keep.prNumber} in ${keep.repository.full_name}`,
      );
    }

    return cleanedCount;
  }

  /**
   * Updates commit counts for existing PRs by fetching data from GitHub API
   * @param repository Optional repository name in format 'owner/repo' to limit the update
   * @returns Summary of the update operation
   */
  /**
   * Updates commit counts by fetching data from GitHub API
   * @param repository Optional repository name in format 'owner/repo' to limit the update
   * @returns Summary of the update operation
   */
  async updateCommitCountsFromGitHub(repository?: string) {
    const githubToken = this.configService.get('GITHUB_TOKEN');
    if (!githubToken) {
      throw new Error('GitHub token is required for this operation');
    }

    // Query to find PRs to update
    const query: any = {};
    if (repository) {
      query['repository.full_name'] = repository;
    }

    const pullRequests = await this.pullRequestModel.find(query);
    console.log(
      `Found ${pullRequests.length} PRs to check for commit count updates`,
    );

    let updatedCount = 0;
    let newCommitsCreated = 0;
    let errors = 0;

    for (const pr of pullRequests) {
      try {
        // Use GitHub API to fetch PR details including commit count
        const apiUrl = `https://api.github.com/repos/${pr.repository.full_name}/pulls/${pr.prNumber}`;

        // Use axios for HTTP requests
        const response = await axios.get(apiUrl, {
          headers: {
            Authorization: `token ${githubToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
        });

        const prData = response.data;
        const commitCount = prData.commits || 0;

        // Find existing commit records for this PR
        const existingCommits = await this.commitModel.find({
          'repository.full_name': pr.repository.full_name,
          branch: prData.head.ref,
        });

        // Calculate total commits from existing records
        const existingCommitCount = existingCommits.reduce(
          (total, commit) => total + (commit.stats?.total || 0),
          0,
        );

        // If no commits found or the commit count doesn't match, create a new commit record
        if (
          existingCommits.length === 0 ||
          existingCommitCount !== commitCount
        ) {
          // Get the author
          const author = await this.userService.findOrCreateUser(prData.user);

          // Create a new commit record with the correct count
          const commitData = {
            sha: prData.head.sha,
            node_id: prData.head.node_id,
            author: author?._id,
            message: `Updated commit count for PR #${pr.prNumber}: ${pr.title}`,
            url: `https://api.github.com/repos/${pr.repository.full_name}/commits/${prData.head.sha}`,
            html_url: `https://github.com/${pr.repository.full_name}/commit/${prData.head.sha}`,
            comments_url: `https://github.com/${pr.repository.full_name}/commit/${prData.head.sha}/comments`,
            repository: {
              id: pr.repository.id,
              node_id: pr.repository.node_id,
              name: pr.repository.name,
              full_name: pr.repository.full_name,
              private: pr.repository.private,
            },
            branch: prData.head.ref,
            added: [],
            removed: [],
            modified: [],
            created_at: new Date(),
            stats: {
              total: commitCount,
              additions: prData.additions || 0,
              deletions: prData.deletions || 0,
            },
          };

          await this.commitModel.create(commitData);
          newCommitsCreated++;
          updatedCount++;
          console.log(
            `Updated commit count for PR #${pr.prNumber} in ${pr.repository.full_name} to ${commitCount} (was ${existingCommitCount})`,
          );
        }
      } catch (error) {
        console.error(
          `Error updating commit count for PR #${pr.prNumber} in ${pr.repository.full_name}:`,
          error.message,
        );
        errors++;
      }
    }

    return {
      totalPRs: pullRequests.length,
      updatedCount,
      newCommitsCreated,
      errors,
    };
  }

  /**
   * Updates commit counts based on existing data in MongoDB
   * This method analyzes PRs and commits in the database and updates commit stats
   * without making external API calls to GitHub
   * @param repository Optional repository name in format 'owner/repo' to limit the update
   * @returns Summary of the update operation
   */
  /**
   * Deletes all commits from the database
   * This can be used to clean up before regenerating commits with updateCommitCounts
   * @param repository Optional repository name in format 'owner/repo' to limit the deletion
   * @returns Summary of the deletion operation
   */
  async deleteAllCommits(repository?: string) {
    // Prepare query to filter commits if repository is specified
    const query: any = {};
    if (repository) {
      query['repository.full_name'] = repository;
    }

    // Count commits before deletion for reporting
    const countBefore = await this.commitModel.countDocuments(query);
    console.log(`Found ${countBefore} commits to delete`);

    // Delete the commits
    const result = await this.commitModel.deleteMany(query);

    console.log(`Deleted ${result.deletedCount} commits`);

    return {
      deletedCount: result.deletedCount,
      repository: repository || 'all',
    };
  }

  /**
   * Fetches commit data from GitHub API for PRs and regenerates commit records
   * This is useful when commit data is missing or has been deleted
   * @param repository Optional repository name in format 'owner/repo' to limit the operation
   * @returns Summary of the operation
   */
  async fetchAndRegenerateCommits(repository?: string) {
    // Prepare query to filter PRs if repository is specified
    const query: any = {};
    if (repository) {
      query['repository.full_name'] = repository;
    }

    // Get all PRs matching the query
    const pullRequests = await this.pullRequestModel.find(query);
    console.log(`Found ${pullRequests.length} PRs to fetch commits for`);

    let totalCommitsCreated = 0;
    let failedPRs = 0;
    const errors = [];

    // Get GitHub token from config
    const githubToken = this.configService.get<string>('GITHUB_TOKEN');
    if (!githubToken) {
      throw new Error(
        'GitHub token is not configured. Set GITHUB_TOKEN in your environment variables.',
      );
    }

    // Process each PR
    for (const pr of pullRequests) {
      try {
        // Skip PRs that don't have a repository or are missing key data
        if (!pr.repository || !pr.repository.full_name || !pr.prNumber) {
          console.warn(`Skipping PR with incomplete data: ${pr._id}`);
          continue;
        }

        const repoFullName = pr.repository.full_name;
        const prNumber = pr.prNumber;

        console.log(`Fetching commits for PR #${prNumber} in ${repoFullName}`);

        // Fetch commits for this PR from GitHub API
        const commitsUrl = `https://api.github.com/repos/${repoFullName}/pulls/${prNumber}/commits`;
        const response = await axios.get(commitsUrl, {
          headers: {
            Authorization: `token ${githubToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
        });

        const commits = response.data;
        console.log(`Found ${commits.length} commits for PR #${prNumber}`);

        // Process each commit
        for (const commit of commits) {
          // Find or create the author user
          const author = await this.userService.findOrCreateUser(
            commit.author || commit.committer,
          );

          // Get the branch name from PR head ref
          const branchName = pr.head?.ref || 'unknown';

          // Fetch detailed commit data to get stats
          const commitDetailUrl = `https://api.github.com/repos/${repoFullName}/commits/${commit.sha}`;
          const commitDetailResponse = await axios.get(commitDetailUrl, {
            headers: {
              Authorization: `token ${githubToken}`,
              Accept: 'application/vnd.github.v3+json',
            },
          });

          const commitDetail = commitDetailResponse.data;

          // Create commit record
          const commitData = {
            sha: commit.sha,
            node_id: commit.node_id,
            author: author?._id,
            message: commit.commit.message,
            url: commit.url,
            html_url: commit.html_url,
            comments_url: commit.comments_url,
            repository: {
              id: pr.repository.id,
              node_id: pr.repository.node_id,
              name: pr.repository.name,
              full_name: pr.repository.full_name,
              private: pr.repository.private,
            },
            branch: branchName,
            added:
              commitDetail.files
                ?.filter((f) => f.status === 'added')
                .map((f) => f.filename) || [],
            removed:
              commitDetail.files
                ?.filter((f) => f.status === 'removed')
                .map((f) => f.filename) || [],
            modified:
              commitDetail.files
                ?.filter((f) => f.status === 'modified')
                .map((f) => f.filename) || [],
            created_at: new Date(
              commit.commit.author.date || commit.commit.committer.date,
            ),
            stats: {
              total: commitDetail.stats?.total || 0,
              additions: commitDetail.stats?.additions || 0,
              deletions: commitDetail.stats?.deletions || 0,
            },
          };

          // Check if this commit already exists
          const existingCommit = await this.commitModel.findOne({
            sha: commit.sha,
          });
          if (!existingCommit) {
            await this.commitModel.create(commitData);
            totalCommitsCreated++;
          }
        }
      } catch (error) {
        console.error(
          `Error fetching commits for PR #${pr.prNumber} in ${pr.repository?.full_name}:`,
          error.message,
        );
        failedPRs++;
        errors.push({
          pr: `${pr.repository?.full_name}#${pr.prNumber}`,
          error: error.message,
        });
      }
    }

    return {
      processedPRs: pullRequests.length,
      commitsCreated: totalCommitsCreated,
      failedPRs,
      errors,
    };
  }

  async updateCommitCounts(repository?: string) {
    // Query to find PRs to update
    const query: any = {};
    if (repository) {
      query['repository.full_name'] = repository;
    }

    // Get all PRs
    const pullRequests = await this.pullRequestModel.find(query);
    console.log(
      `Found ${pullRequests.length} PRs to check for commit count updates`,
    );

    let updatedCount = 0;
    let newCommitsCreated = 0;
    let errors = 0;

    // Group PRs by repository and branch
    const prsByRepoBranch: Record<string, PullRequest[]> = pullRequests.reduce(
      (acc, pr) => {
        const key = `${pr.repository.full_name}:${pr.head?.ref || ''}`;
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(pr);
        return acc;
      },
      {} as Record<string, PullRequest[]>,
    );

    // Process each repository/branch group
    for (const [repoBranchKey, prs] of Object.entries<PullRequest[]>(
      prsByRepoBranch,
    )) {
      try {
        const [repoFullName, branchName] = repoBranchKey.split(':');
        if (!branchName) {
          console.log(
            `Skipping PRs for ${repoFullName} with no branch information`,
          );
          continue;
        }

        // Find all commits for this repository and branch
        const commits = await this.commitModel
          .find({
            'repository.full_name': repoFullName,
            branch: branchName,
          })
          .sort({ created_at: 1 });

        if (commits.length === 0) {
          console.log(`No commits found for ${repoFullName}:${branchName}`);
          continue;
        }

        // Get the most recent PR for this branch
        const sortedPRs = [...prs].sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
        );
        const latestPR = sortedPRs[0];

        // Count total commits for this branch
        const totalCommits = commits.reduce((total, commit) => {
          // If commit has stats.total, use that value
          if (commit.stats?.total) {
            return total + commit.stats.total;
          }
          // Otherwise count it as 1 commit
          return total + 1;
        }, 0);

        // If we have a PR with a different commit count than what we've calculated,
        // create a new commit record with the correct count
        const existingCommitCount = commits.reduce(
          (total, commit) => total + (commit.stats?.total || 0),
          0,
        );

        // If the latest commit doesn't have the correct total, update it
        const latestCommit = commits[commits.length - 1];
        if (latestCommit && latestCommit.stats?.total !== totalCommits) {
          // Create a new commit record with the correct count
          const commitData = {
            sha: latestCommit.sha,
            node_id: latestCommit.node_id,
            author: latestCommit.author,
            message: `Updated commit count for PR #${latestPR.prNumber}: ${latestPR.title}`,
            url: latestCommit.url,
            html_url: latestCommit.html_url,
            comments_url: latestCommit.comments_url,
            repository: latestCommit.repository,
            branch: branchName,
            added: [],
            removed: [],
            modified: [],
            created_at: latestCommit.created_at || new Date(),
            stats: {
              total: totalCommits,
              additions: latestCommit.stats?.additions || 0,
              deletions: latestCommit.stats?.deletions || 0,
            },
          };

          await this.commitModel.create(commitData);
          newCommitsCreated++;
          updatedCount++;
          console.log(
            `Updated commit count for PR #${latestPR.prNumber} in ${repoFullName} to ${totalCommits} (was ${existingCommitCount})`,
          );
        }
      } catch (error) {
        console.error(
          `Error updating commit count for ${repoBranchKey}:`,
          error.message,
        );
        errors++;
      }
    }

    return {
      totalPRs: pullRequests.length,
      updatedCount,
      newCommitsCreated,
      errors,
    };
  }
}
