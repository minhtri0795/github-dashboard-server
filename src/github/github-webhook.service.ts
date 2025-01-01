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
    // Check if it's a push event
    if (payload.commits) {
      return this.handlePushEvent(payload);
    }

    // If it's a synchronize action in PR event, handle as commit
    if (payload.action === 'synchronize') {
      const { pull_request: pr, repository, after } = payload;

      // Create commit record for the new head commit
      const author = await this.userService.findOrCreateUser(pr.user);
      const commitData = {
        sha: after,
        node_id: pr.head.node_id,
        author: author._id,
        message: `New commit on PR #${pr.number}: ${pr.title}`,
        url: `${repository.url}/commits/${after}`,
        html_url: `${repository.html_url}/commit/${after}`,
        comments_url: `${repository.html_url}/commit/${after}/comments`,
        repository: {
          id: repository.id,
          node_id: repository.node_id,
          name: repository.name,
          full_name: repository.full_name,
          private: repository.private,
        },
        branch: pr.head.ref,
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
    return this.handlePullRequestEvent(payload);
  }

  private async handlePullRequestEvent(payload: any) {
    const { action, pull_request: pr, repository } = payload;

    // First, handle the user
    const user = await this.userService.findOrCreateUser(pr.user);

    // Handle merged_by user if PR is merged
    let merged_by = null;
    if (pr.merged && pr.merged_by) {
      merged_by = await this.userService.findOrCreateUser(pr.merged_by);
    }

    const pullRequestData = {
      prNumber: pr.number,
      node_id: pr.node_id,
      title: pr.title,
      state: pr.state,
      locked: pr.locked,
      user: user._id,
      merged_by: merged_by?._id,
      body: pr.body,
      url: pr.url,
      html_url: pr.html_url,
      diff_url: pr.diff_url,
      patch_url: pr.patch_url,
      issue_url: pr.issue_url,
      created_at: new Date(pr.created_at),
      updated_at: new Date(pr.updated_at),
      closed_at: pr.closed_at ? new Date(pr.closed_at) : undefined,
      merged_at: pr.merged_at ? new Date(pr.merged_at) : undefined,
      merge_commit_sha: pr.merge_commit_sha,
      merged: pr.merged || false,
      mergeable: pr.mergeable,
      rebaseable: pr.rebaseable,
      mergeable_state: pr.mergeable_state,
      head: {
        label: pr.head.label,
        ref: pr.head.ref,
        sha: pr.head.sha,
      },
      base: {
        label: pr.base.label,
        ref: pr.base.ref,
        sha: pr.base.sha,
      },
      repository: {
        id: repository.id,
        node_id: repository.node_id,
        name: repository.name,
        full_name: repository.full_name,
        private: repository.private,
      },
    };

    if (action === 'opened') {
      // Send Discord notification for new PR
      await this.discordService.sendPROpenedNotification(payload);
      return await this.pullRequestModel.create(pullRequestData);
    } else if (action === 'closed') {
      // First check if PR exists
      const existingPR = await this.pullRequestModel.findOne({
        prNumber: pr.number,
      });
      if (!existingPR) {
        console.warn(`Received close event for non-existent PR #${pr.number}`);
        // Create the PR if it doesn't exist, but log a warning
        return await this.pullRequestModel.create(pullRequestData);
      }

      // Send Discord notification for closed PR if it was merged
      await this.discordService.sendPRClosedNotification(payload);

      // Update existing PR
      return await this.pullRequestModel.findOneAndUpdate(
        { prNumber: pr.number },
        pullRequestData,
        { new: true },
      );
    }
  }

  private async handlePushEvent(payload: any) {
    const { repository, commits, ref } = payload;
    const branch = ref.replace('refs/heads/', '');

    const savedCommits = [];
    for (const commit of commits) {
      // Get or create user for commit author
      const author = await this.userService.findOrCreateUser(commit.author);

      const commitData = {
        sha: commit.id,
        node_id: commit.node_id,
        author: author._id,
        message: commit.message,
        url: commit.url,
        html_url: `${repository.html_url}/commit/${commit.id}`,
        comments_url: `${repository.html_url}/commit/${commit.id}/comments`,
        repository: {
          id: repository.id,
          node_id: repository.node_id,
          name: repository.name,
          full_name: repository.full_name,
          private: repository.private,
        },
        branch,
        added: commit.added,
        removed: commit.removed,
        modified: commit.modified,
        created_at: new Date(commit.timestamp),
        stats: {
          total:
            commit.added.length +
            commit.removed.length +
            commit.modified.length,
          additions: commit.added.length,
          deletions: commit.removed.length,
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

  private getDateFilter(dateFilter: DateFilterDto) {
    const filter: any = {};

    if (dateFilter.startDate || dateFilter.endDate) {
      filter.created_at = {};

      if (dateFilter.startDate) {
        filter.created_at.$gte = new Date(dateFilter.startDate);
      }

      if (dateFilter.endDate) {
        filter.created_at.$lte = new Date(dateFilter.endDate);
      }
    }

    return filter;
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
              created_at: '$created_at',
              closed_at: '$closed_at',
              merged: '$merged',
              user: '$user',
              html_url: '$html_url',
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
          as: 'users',
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

  async getPRStatistics() {
    const [totalPRs, totalClosedPRs, totalMergedPRs, totalOpenPRs] =
      await Promise.all([
        this.pullRequestModel.countDocuments(),
        this.pullRequestModel.countDocuments({ state: 'closed' }),
        this.pullRequestModel.countDocuments({ merged: true }),
        this.pullRequestModel.countDocuments({ state: 'open' }),
      ]);

    const prsByAuthor = await this.pullRequestModel.aggregate([
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'userInfo',
        },
      },
      {
        $unwind: '$userInfo',
      },
      {
        $group: {
          _id: '$user',
          user: { $first: '$userInfo' },
          totalPRs: { $sum: 1 },
          mergedPRs: {
            $sum: { $cond: [{ $eq: ['$merged', true] }, 1, 0] },
          },
          closedPRs: {
            $sum: { $cond: [{ $eq: ['$state', 'closed'] }, 1, 0] },
          },
        },
      },
    ]);

    return {
      summary: {
        totalPRs,
        totalClosedPRs,
        totalMergedPRs,
        totalOpenPRs,
      },
      prsByAuthor,
    };
  }

  async getPRsByRepository() {
    return await this.pullRequestModel.aggregate([
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

    const selfMergedPRs = await this.pullRequestModel.aggregate([
      {
        $match: {
          ...dateQuery,
          state: 'closed',
          merged: true,
          $expr: { $eq: ['$user', '$merged_by'] },
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
        $unwind: '$user',
      },
      {
        $unwind: '$merged_by',
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

    const totalSelfMergedPRs = await this.pullRequestModel.countDocuments({
      ...dateQuery,
      state: 'closed',
      merged: true,
      $expr: { $eq: ['$user', '$merged_by'] },
    });

    const repositoryStats = await this.pullRequestModel.aggregate([
      {
        $match: {
          ...dateQuery,
          state: 'closed',
          merged: true,
          $expr: { $eq: ['$user', '$merged_by'] },
        },
      },
      {
        $group: {
          _id: '$repository.full_name',
          repository: { $first: '$repository' },
          totalSelfMerges: { $sum: 1 },
        },
      },
      {
        $sort: { totalSelfMerges: -1 },
      },
    ]);

    return {
      summary: {
        totalSelfMergedPRs,
        uniqueUsers: selfMergedPRs.length,
      },
      userStats: selfMergedPRs,
      repositoryStats,
    };
  }
}
