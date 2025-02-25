import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from './schemas/user.schema';
import { PullRequest } from './schemas/pull-request.schema';
import { DateFilterDto } from './dto/date-filter.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name)
    private userModel: Model<User>,
    @InjectModel(PullRequest.name)
    private pullRequestModel: Model<PullRequest>,
  ) {}

  async getUsers(dateFilter?: DateFilterDto) {
    const { startDate, endDate } = this.getDateRange(dateFilter);

    const users = await this.userModel.find().exec();
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const stats = await this.getUserBasicStats(user, startDate, endDate);
        return stats;
      }),
    );

    return usersWithStats;
  }

  async getUserDetails(githubId: number, dateFilter?: DateFilterDto) {
    const { startDate, endDate } = this.getDateRange(dateFilter);
    const user = await this.userModel.findOne({ githubId }).exec();

    if (!user) {
      throw new NotFoundException(`User with githubId ${githubId} not found`);
    }

    const query = {
      user: user._id,
      $or: [
        { created_at: { $gte: startDate, $lte: endDate } },
        { closed_at: { $gte: startDate, $lte: endDate } },
        { merged_at: { $gte: startDate, $lte: endDate } },
      ],
    };

    const userPRs = await this.pullRequestModel
      .find(query)
      .populate('user merged_by')
      .lean()
      .exec();

    // Group PRs by their state
    const openPullRequests = userPRs
      .filter((pr) => pr.state === 'open')
      .map((pr) => ({
        prNumber: pr.prNumber,
        title: pr.title,
        html_url: pr.html_url,
        repository: pr.repository,
        created_at: pr.created_at,
        updated_at: pr.updated_at,
      }));

    const closedPullRequests = userPRs
      .filter((pr) => pr.state === 'closed')
      .map((pr) => ({
        prNumber: pr.prNumber,
        title: pr.title,
        html_url: pr.html_url,
        repository: pr.repository,
        created_at: pr.created_at,
        closed_at: pr.closed_at,
        merged: pr.merged,
      }));

    const selfMergedPullRequests = userPRs
      .filter(
        (pr) =>
          pr.state === 'closed' &&
          pr.merged === true &&
          pr.merged_by?.githubId === user.githubId,
      )
      .map((pr) => ({
        prNumber: pr.prNumber,
        title: pr.title,
        html_url: pr.html_url,
        repository: pr.repository,
        created_at: pr.created_at,
        merged_at: pr.merged_at,
      }));

    type DailyActivity = {
      created: number;
      closed: number;
      merged: number;
    };

    const activityByDay = userPRs.reduce<Record<string, DailyActivity>>(
      (acc, pr) => {
        const date = new Date(pr.created_at).toISOString().split('T')[0];
        if (!acc[date]) {
          acc[date] = {
            created: 0,
            closed: 0,
            merged: 0,
          };
        }
        acc[date].created++;
        if (pr.state === 'closed') {
          const closedDate = new Date(pr.closed_at).toISOString().split('T')[0];
          if (!acc[closedDate]) {
            acc[closedDate] = {
              created: 0,
              closed: 0,
              merged: 0,
            };
          }
          acc[closedDate].closed++;
        }
        if (pr.merged) {
          const mergedDate = new Date(pr.merged_at).toISOString().split('T')[0];
          if (!acc[mergedDate]) {
            acc[mergedDate] = {
              created: 0,
              closed: 0,
              merged: 0,
            };
          }
          acc[mergedDate].merged++;
        }
        return acc;
      },
      {},
    );

    const userObject = {
      _id: user._id,
      githubId: user.githubId,
      login: user.login,

      avatar_url: user.avatar_url,
    };

    return {
      ...userObject,
      statistics: {
        summary: {
          openPRs: openPullRequests.length,
          closedPRs: closedPullRequests.length,
          selfMergedPRs: selfMergedPullRequests.length,
        },
        details: {
          openPullRequests,
          closedPullRequests,
          selfMergedPullRequests,
        },
        activityByDay: Object.entries(activityByDay)
          .map(([date, counts]) => ({
            date,
            created: counts.created,
            closed: counts.closed,
            merged: counts.merged,
          }))
          .sort((a, b) => a.date.localeCompare(b.date)),
      },
      dateRange: {
        startDate,
        endDate,
      },
    };
  }

  private async getUserBasicStats(user: any, startDate: Date, endDate: Date) {
    const query = {
      user: user._id,
      $or: [
        { created_at: { $gte: startDate, $lte: endDate } },
        { closed_at: { $gte: startDate, $lte: endDate } },
        { merged_at: { $gte: startDate, $lte: endDate } },
      ],
    };

    const userPRs = await this.pullRequestModel
      .find(query)
      .populate('user merged_by')
      .lean()
      .exec();

    const openPRs = userPRs.filter((pr) => pr.state === 'open').length;
    const closedPRs = userPRs.filter((pr) => pr.state === 'closed').length;
    const selfMergedPRs = userPRs.filter(
      (pr) =>
        pr.state === 'closed' &&
        pr.merged === true &&
        pr.merged_by?.githubId === user.githubId,
    ).length;

    const userObject = {
      _id: user._id,
      githubId: user.githubId,
      login: user.login,
      name: user.name,
      email: user.email,
      avatar_url: user.avatar_url,
    };

    return {
      ...userObject,
      statistics: {
        openPRs,
        closedPRs,
        selfMergedPRs,
      },
      dateRange: {
        startDate,
        endDate,
      },
    };
  }

  private getDateRange(dateFilter?: DateFilterDto) {
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

  async findOrCreateUser(userData: any) {
    const existingUser = await this.userModel.findOne({
      githubId: userData.id,
    });

    if (existingUser) {
      return existingUser;
    }

    return await this.userModel.create({
      githubId: userData.id,
      login: userData.login,
      name: userData.name,
      email: userData.email,
      avatar_url: userData.avatar_url,
      type: 'User',
    });
  }

  async findById(id: string) {
    return await this.userModel.findById(id).exec();
  }
}
