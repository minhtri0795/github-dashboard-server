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

  private getDateRange(dateFilter: DateFilterDto) {
    const endDate = dateFilter.endDate
      ? new Date(dateFilter.endDate)
      : new Date();
    const startDate = dateFilter.startDate
      ? new Date(dateFilter.startDate)
      : new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

    return { startDate, endDate };
  }

  private async getUserStats(user: any, startDate: Date, endDate: Date) {
    const query = {
      user: user._id,
      created_at: {
        $gte: startDate,
        $lte: endDate,
      },
    };

    console.log(
      'Searching PRs for user:',
      user.login,
      'with id:',
      user._id,
      'in date range:',
      { startDate, endDate },
    );

    const userPRs = await this.pullRequestModel
      .find(query)
      .populate('user merged_by')
      .lean()
      .exec();

    console.log(`Found ${userPRs.length} PRs for user ${user.login}`);
    if (userPRs.length > 0) {
      console.log('Sample PR:', JSON.stringify(userPRs[0], null, 2));
    }

    // Count different PR states
    const openPRs = userPRs.filter((pr) => pr.state === 'open').length;
    const closedPRs = userPRs.filter((pr) => pr.state === 'closed').length;
    const selfMergedPRs = userPRs.filter(
      (pr) =>
        pr.state === 'closed' &&
        pr.merged === true &&
        pr.merged_by?._id.toString() === user._id.toString(),
    ).length;

    return {
      ...user.toJSON(),
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
    });
  }

  async getAllUsers(dateFilter: DateFilterDto) {
    const users = await this.userModel
      .find()
      .select('githubId login name email avatar_url')
      .sort({ login: 1 })
      .exec();

    const { startDate, endDate } = this.getDateRange(dateFilter);
    console.log('Date range:', { startDate, endDate });

    return await Promise.all(
      users.map((user) => this.getUserStats(user, startDate, endDate)),
    );
  }

  async getUserByLogin(login: string, dateFilter: DateFilterDto) {
    const user = await this.userModel
      .findOne({ login })
      .select('githubId login name email avatar_url')
      .exec();

    if (!user) {
      throw new NotFoundException(`User with login ${login} not found`);
    }

    const { startDate, endDate } = this.getDateRange(dateFilter);
    return await this.getUserStats(user, startDate, endDate);
  }

  async findById(id: string) {
    return await this.userModel.findById(id).exec();
  }
}
