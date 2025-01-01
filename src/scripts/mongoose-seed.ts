import { MongooseModule } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { User, UserSchema } from '../github/schemas/user.schema';
import {
  PullRequest,
  PullRequestSchema,
} from '../github/schemas/pull-request.schema';
import { Commit, CommitSchema } from '../github/schemas/commit.schema';
import { Model } from 'mongoose';
import mongodbConfig from '../config/mongodb.config';

async function seed() {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        load: [mongodbConfig],
      }),
      MongooseModule.forRootAsync({
        imports: [ConfigModule],
        useFactory: async () => ({
          uri: process.env.MONGODB_URI,
          dbName: 'sd-dashboard',
        }),
      }),
      MongooseModule.forFeature([
        { name: User.name, schema: UserSchema },
        { name: PullRequest.name, schema: PullRequestSchema },
        { name: Commit.name, schema: CommitSchema },
      ]),
    ],
  }).compile();

  const userModel = moduleRef.get<Model<User>>('UserModel');
  const prModel = moduleRef.get<Model<PullRequest>>('PullRequestModel');
  const commitModel = moduleRef.get<Model<Commit>>('CommitModel');

  // Clear existing data
  await userModel.deleteMany({});
  await prModel.deleteMany({});
  await commitModel.deleteMany({});

  // Create example users
  const users = await userModel.create([
    {
      githubId: 1,
      login: 'john.doe',
      node_id: 'U_1',
      avatar_url: 'https://github.com/john.doe.png',
      type: 'User',
      html_url: 'https://github.com/john.doe',
    },
    {
      githubId: 2,
      login: 'jane.smith',
      node_id: 'U_2',
      avatar_url: 'https://github.com/jane.smith.png',
      type: 'User',
      html_url: 'https://github.com/jane.smith',
    },
    {
      githubId: 3,
      login: 'bob.wilson',
      node_id: 'U_3',
      avatar_url: 'https://github.com/bob.wilson.png',
      type: 'User',
      html_url: 'https://github.com/bob.wilson',
    },
  ]);

  console.log('Inserted users:', users.length);

  // Create example PRs
  const now = new Date();
  const prs = await prModel.create([
    {
      prNumber: 1,
      node_id: 'PR_1',
      title: 'Add user authentication',
      state: 'closed',
      locked: false,
      user: users[0]._id,
      merged_by: users[1]._id,
      body: 'Implements user authentication system',
      url: 'https://api.github.com/repos/org/repo1/pulls/1',
      html_url: 'https://github.com/org/repo1/pull/1',
      diff_url: 'https://github.com/org/repo1/pull/1.diff',
      patch_url: 'https://github.com/org/repo1/pull/1.patch',
      issue_url: 'https://api.github.com/repos/org/repo1/issues/1',
      created_at: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      updated_at: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000),
      closed_at: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000),
      merged_at: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000),
      merge_commit_sha: '1234567890abcdef1234567890abcdef12345678',
      merged: true,
      mergeable: true,
      rebaseable: true,
      mergeable_state: 'clean',
      head: {
        label: 'org:feature/auth',
        ref: 'feature/auth',
        sha: '1234567890abcdef1234567890abcdef12345678',
      },
      base: {
        label: 'org:main',
        ref: 'main',
        sha: 'abcdef1234567890abcdef1234567890abcdef12',
      },
      repository: {
        id: 1,
        node_id: 'R_1',
        name: 'repo1',
        full_name: 'org/repo1',
        private: false,
      },
    },
    {
      prNumber: 2,
      node_id: 'PR_2',
      title: 'Update API documentation',
      state: 'closed',
      locked: false,
      user: users[0]._id,
      merged_by: users[0]._id, // Self-merged by user 0
      body: 'Updates API documentation with new endpoints',
      url: 'https://api.github.com/repos/org/repo1/pulls/2',
      html_url: 'https://github.com/org/repo1/pull/2',
      diff_url: 'https://github.com/org/repo1/pull/2.diff',
      patch_url: 'https://github.com/org/repo1/pull/2.patch',
      issue_url: 'https://api.github.com/repos/org/repo1/issues/2',
      created_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      updated_at: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000),
      closed_at: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000),
      merged_at: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000),
      merge_commit_sha: '234567890abcdef1234567890abcdef1234567890',
      merged: true,
      mergeable: true,
      rebaseable: true,
      mergeable_state: 'clean',
      head: {
        label: 'org:docs/api',
        ref: 'docs/api',
        sha: '234567890abcdef1234567890abcdef1234567890',
      },
      base: {
        label: 'org:main',
        ref: 'main',
        sha: 'bcdef1234567890abcdef1234567890abcdef123',
      },
      repository: {
        id: 1,
        node_id: 'R_1',
        name: 'repo1',
        full_name: 'org/repo1',
        private: false,
      },
    },
    {
      prNumber: 3,
      node_id: 'PR_3',
      title: 'Fix database connection timeout',
      state: 'closed',
      locked: false,
      user: users[1]._id,
      merged_by: users[1]._id, // Self-merged by user 1
      body: 'Fixes database connection timeout issues',
      url: 'https://api.github.com/repos/org/repo2/pulls/3',
      html_url: 'https://github.com/org/repo2/pull/3',
      diff_url: 'https://github.com/org/repo2/pull/3.diff',
      patch_url: 'https://github.com/org/repo2/pull/3.patch',
      issue_url: 'https://api.github.com/repos/org/repo2/issues/3',
      created_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      updated_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      closed_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      merged_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      merge_commit_sha: '34567890abcdef1234567890abcdef1234567890a',
      merged: true,
      mergeable: true,
      rebaseable: true,
      mergeable_state: 'clean',
      head: {
        label: 'org:fix/db-timeout',
        ref: 'fix/db-timeout',
        sha: '34567890abcdef1234567890abcdef1234567890a',
      },
      base: {
        label: 'org:main',
        ref: 'main',
        sha: 'cdef1234567890abcdef1234567890abcdef1234',
      },
      repository: {
        id: 2,
        node_id: 'R_2',
        name: 'repo2',
        full_name: 'org/repo2',
        private: false,
      },
    },
    {
      prNumber: 4,
      node_id: 'PR_4',
      title: 'Update test coverage',
      state: 'closed',
      locked: false,
      user: users[1]._id,
      merged_by: users[1]._id, // Self-merged by user 1
      body: 'Increases test coverage for core modules',
      url: 'https://api.github.com/repos/org/repo2/pulls/4',
      html_url: 'https://github.com/org/repo2/pull/4',
      diff_url: 'https://github.com/org/repo2/pull/4.diff',
      patch_url: 'https://github.com/org/repo2/pull/4.patch',
      issue_url: 'https://api.github.com/repos/org/repo2/issues/4',
      created_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      updated_at: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      closed_at: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      merged_at: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      merge_commit_sha: '4567890abcdef1234567890abcdef1234567890ab',
      merged: true,
      mergeable: true,
      rebaseable: true,
      mergeable_state: 'clean',
      head: {
        label: 'org:test/coverage',
        ref: 'test/coverage',
        sha: '4567890abcdef1234567890abcdef1234567890ab',
      },
      base: {
        label: 'org:main',
        ref: 'main',
        sha: 'def1234567890abcdef1234567890abcdef12345',
      },
      repository: {
        id: 2,
        node_id: 'R_2',
        name: 'repo2',
        full_name: 'org/repo2',
        private: false,
      },
    },
    {
      prNumber: 5,
      node_id: 'PR_5',
      title: 'Add new feature',
      state: 'open',
      locked: false,
      user: users[2]._id,
      body: 'Adds an exciting new feature',
      url: 'https://api.github.com/repos/org/repo1/pulls/5',
      html_url: 'https://github.com/org/repo1/pull/5',
      diff_url: 'https://github.com/org/repo1/pull/5.diff',
      patch_url: 'https://github.com/org/repo1/pull/5.patch',
      issue_url: 'https://api.github.com/repos/org/repo1/issues/5',
      created_at: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      updated_at: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      head: {
        label: 'org:feature/new',
        ref: 'feature/new',
        sha: '567890abcdef1234567890abcdef1234567890abc',
      },
      base: {
        label: 'org:main',
        ref: 'main',
        sha: 'ef1234567890abcdef1234567890abcdef123456',
      },
      repository: {
        id: 1,
        node_id: 'R_1',
        name: 'repo1',
        full_name: 'org/repo1',
        private: false,
      },
    },
    {
      prNumber: 6,
      node_id: 'PR_6',
      title: 'Experimental feature',
      state: 'closed',
      locked: false,
      user: users[2]._id,
      body: 'Adds an experimental feature',
      url: 'https://api.github.com/repos/org/repo2/pulls/6',
      html_url: 'https://github.com/org/repo2/pull/6',
      diff_url: 'https://github.com/org/repo2/pull/6.diff',
      patch_url: 'https://github.com/org/repo2/pull/6.patch',
      issue_url: 'https://api.github.com/repos/org/repo2/issues/6',
      created_at: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000),
      updated_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      closed_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      head: {
        label: 'org:feature/experimental',
        ref: 'feature/experimental',
        sha: '67890abcdef1234567890abcdef1234567890abcd',
      },
      base: {
        label: 'org:main',
        ref: 'main',
        sha: 'f1234567890abcdef1234567890abcdef1234567',
      },
      repository: {
        id: 2,
        node_id: 'R_2',
        name: 'repo2',
        full_name: 'org/repo2',
        private: false,
      },
    },
  ]);

  console.log('Inserted PRs:', prs.length);

  // Create example commits
  const commits = await commitModel.create([
    {
      sha: '1234567890abcdef1234567890abcdef12345678',
      node_id: 'C_1',
      author: users[0]._id,
      message: 'feat: Add user authentication system',
      url: 'https://api.github.com/repos/org/repo1/commits/1234567',
      html_url: 'https://github.com/org/repo1/commit/1234567',
      comments_url: 'https://github.com/org/repo1/commit/1234567/comments',
      repository: {
        id: 1,
        node_id: 'R_1',
        name: 'repo1',
        full_name: 'org/repo1',
        private: false,
      },
      branch: 'main',
      added: ['src/auth/auth.service.ts', 'src/auth/auth.controller.ts'],
      removed: [],
      modified: ['src/app.module.ts'],
      created_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      stats: {
        total: 3,
        additions: 2,
        deletions: 1,
      },
    },
    {
      sha: 'abcdef1234567890abcdef1234567890abcdef12',
      node_id: 'C_2',
      author: users[1]._id,
      message: 'fix: Database connection timeout',
      url: 'https://api.github.com/repos/org/repo1/commits/abcdef',
      html_url: 'https://github.com/org/repo1/commit/abcdef',
      comments_url: 'https://github.com/org/repo1/commit/abcdef/comments',
      repository: {
        id: 1,
        node_id: 'R_1',
        name: 'repo1',
        full_name: 'org/repo1',
        private: false,
      },
      branch: 'fix/db-timeout',
      added: [],
      removed: [],
      modified: ['src/config/database.config.ts'],
      created_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      stats: {
        total: 1,
        additions: 1,
        deletions: 0,
      },
    },
    {
      sha: '890abcdef1234567890abcdef1234567890abcde',
      node_id: 'C_3',
      author: users[2]._id,
      message: 'docs: Update API documentation',
      url: 'https://api.github.com/repos/org/repo2/commits/890abc',
      html_url: 'https://github.com/org/repo2/commit/890abc',
      comments_url: 'https://github.com/org/repo2/commit/890abc/comments',
      repository: {
        id: 2,
        node_id: 'R_2',
        name: 'repo2',
        full_name: 'org/repo2',
        private: false,
      },
      branch: 'main',
      added: ['docs/api.md'],
      removed: ['docs/old-api.md'],
      modified: ['README.md'],
      created_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      stats: {
        total: 3,
        additions: 1,
        deletions: 1,
      },
    },
    {
      sha: '567890abcdef1234567890abcdef1234567890ab',
      node_id: 'C_4',
      author: users[0]._id,
      message: 'feat: Add dashboard components',
      url: 'https://api.github.com/repos/org/repo2/commits/567890',
      html_url: 'https://github.com/org/repo2/commit/567890',
      comments_url: 'https://github.com/org/repo2/commit/567890/comments',
      repository: {
        id: 2,
        node_id: 'R_2',
        name: 'repo2',
        full_name: 'org/repo2',
        private: false,
      },
      branch: 'feature/dashboard',
      added: [
        'src/components/Dashboard.tsx',
        'src/components/DashboardCard.tsx',
        'src/styles/dashboard.css',
      ],
      removed: [],
      modified: ['src/App.tsx', 'src/routes.ts'],
      created_at: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      stats: {
        total: 5,
        additions: 3,
        deletions: 2,
      },
    },
    {
      sha: '234567890abcdef1234567890abcdef1234567890',
      node_id: 'C_5',
      author: users[1]._id,
      message: 'test: Add unit tests for auth service',
      url: 'https://api.github.com/repos/org/repo1/commits/234567',
      html_url: 'https://github.com/org/repo1/commit/234567',
      comments_url: 'https://github.com/org/repo1/commit/234567/comments',
      repository: {
        id: 1,
        node_id: 'R_1',
        name: 'repo1',
        full_name: 'org/repo1',
        private: false,
      },
      branch: 'main',
      added: ['src/auth/auth.service.spec.ts'],
      removed: [],
      modified: [],
      created_at: new Date(now.getTime() - 12 * 60 * 60 * 1000),
      stats: {
        total: 1,
        additions: 1,
        deletions: 0,
      },
    },
  ]);

  console.log('Inserted commits:', commits.length);
  console.log('Seeding completed successfully!');

  await moduleRef.close();
  process.exit(0);
}

seed().catch((error) => {
  console.warn('Error seeding data:', error);
  process.exit(1);
});
