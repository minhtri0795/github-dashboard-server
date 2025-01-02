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
  async getPRStatistics() {
    return await this.githubWebhookService.getPRStatistics();
  }

  @Get('repository-stats')
  async getPRsByRepository() {
    return await this.githubWebhookService.getPRsByRepository();
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
  async getAllUsers(@Query() dateFilter: DateFilterDto) {
    return await this.userService.getAllUsers(dateFilter);
  }

  @Get('users/:login')
  async getUserByLogin(
    @Query() dateFilter: DateFilterDto,
    @Param('login') login: string,
  ) {
    return await this.userService.getUserByLogin(login, dateFilter);
  }
}
