import { Controller, Post, Body, Get, Query, Param } from '@nestjs/common';
import { GitHubWebhookService } from './github-webhook.service';
import { UserService } from './user.service';
import { DateFilterDto } from './dto/date-filter.dto';

@Controller('webhooks/github')
export class GitHubWebhookController {
  constructor(
    private readonly githubWebhookService: GitHubWebhookService,
    private readonly userService: UserService,
  ) {}

  @Post()
  async handleGitHubWebhook(@Body() payload: any) {
    return await this.githubWebhookService.handleWebhookEvent(payload);
  }

  @Get('pull-requests')
  async getAllPullRequests() {
    return await this.githubWebhookService.getAllPullRequests();
  }

  @Get('statistics')
  async getPRStatistics(@Query() dateFilter: DateFilterDto) {
    return await this.githubWebhookService.getPRStatistics(dateFilter);
  }

  @Get('repository-stats')
  async getPRsByRepository(@Query() dateFilter: DateFilterDto) {
    return await this.githubWebhookService.getPRsByRepository(dateFilter);
  }

  @Get('open-prs')
  async getOpenPRs(@Query() dateFilter: DateFilterDto) {
    return await this.githubWebhookService.getOpenPRs(dateFilter);
  }

  @Get('closed-prs')
  async getClosedPRs(@Query() dateFilter: DateFilterDto) {
    return await this.githubWebhookService.getClosedPRs(dateFilter);
  }

  @Get('commits')
  async getCommitsByDate(@Query() dateFilter: DateFilterDto) {
    return await this.githubWebhookService.getCommitsByDate(dateFilter);
  }

  @Get('commit-statistics')
  async getCommitStatistics() {
    return await this.githubWebhookService.getCommitStatistics();
  }

  @Get('self-merged-prs')
  async getSelfMergedPRs(@Query() dateFilter: DateFilterDto) {
    return await this.githubWebhookService.getSelfMergedPRs(dateFilter);
  }

  @Get('users')
  async getUsers(@Query() dateFilter: DateFilterDto) {
    return this.userService.getUsers(dateFilter);
  }

  @Get('users/:githubId')
  async getUserDetails(
    @Param('githubId') githubId: number,
    @Query() dateFilter: DateFilterDto,
  ) {
    return this.userService.getUserDetails(githubId, dateFilter);
  }

  @Post('cleanup-duplicates')
  async cleanupDuplicatePRs() {
    const cleanedCount = await this.githubWebhookService.cleanupDuplicatePRs();
    return {
      message: `Cleaned up ${cleanedCount} duplicate PR(s)`,
      cleanedCount,
    };
  }
}
