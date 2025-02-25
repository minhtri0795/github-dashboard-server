import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PullRequest } from './schemas/pull-request.schema';
import { Commit } from './schemas/commit.schema';
import { UserService } from './user.service';
import { DateFilterDto } from './dto/date-filter.dto';
import { DiscordService } from './discord.service';

@Injectable()
export class GitHubWebhookService {
  constructor(
    @InjectModel(PullRequest.name)
    private pullRequestModel: Model<PullRequest>,
    @InjectModel(Commit.name)
    private commitModel: Model<Commit>,
    private userService: UserService,
    private discordService: DiscordService,
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
            total: 1,
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
}
