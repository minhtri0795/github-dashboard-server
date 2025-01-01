import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GitHubWebhookController } from './github-webhook.controller';
import { GitHubWebhookService } from './github-webhook.service';
import { PullRequest, PullRequestSchema } from './schemas/pull-request.schema';
import { Commit, CommitSchema } from './schemas/commit.schema';
import { User, UserSchema } from './schemas/user.schema';
import { UserService } from './user.service';
import { DiscordService } from './discord.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PullRequest.name, schema: PullRequestSchema },
      { name: Commit.name, schema: CommitSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [GitHubWebhookController],
  providers: [GitHubWebhookService, UserService, DiscordService],
})
export class GitHubModule {}
