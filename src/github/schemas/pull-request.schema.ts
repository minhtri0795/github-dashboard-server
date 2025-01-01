import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { User } from './user.schema';

@Schema({ timestamps: true, collection: 'pullrequests' })
export class PullRequest extends Document {
  @Prop({ required: true })
  prNumber: number;

  @Prop()
  node_id: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  state: string;

  @Prop()
  locked: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  user: User;

  @Prop()
  body?: string;

  @Prop()
  url: string;

  @Prop()
  html_url: string;

  @Prop()
  diff_url: string;

  @Prop()
  patch_url: string;

  @Prop()
  issue_url: string;

  @Prop()
  created_at: Date;

  @Prop()
  updated_at: Date;

  @Prop()
  closed_at?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  merged_by?: User;

  @Prop()
  merged_at?: Date;

  @Prop()
  merge_commit_sha?: string;

  @Prop({ type: Object })
  head: {
    label: string;
    ref: string;
    sha: string;
  };

  @Prop({ type: Object })
  base: {
    label: string;
    ref: string;
    sha: string;
  };

  @Prop({ type: Object })
  repository: {
    id: number;
    node_id: string;
    name: string;
    full_name: string;
    private: boolean;
  };

  @Prop({ default: false })
  merged: boolean;

  @Prop()
  mergeable?: boolean;

  @Prop()
  rebaseable?: boolean;

  @Prop()
  mergeable_state?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  labels?: any[];

  @Prop({ type: [{ type: MongooseSchema.Types.ObjectId, ref: 'User' }] })
  assignees?: User[];

  @Prop({ type: [{ type: MongooseSchema.Types.ObjectId, ref: 'User' }] })
  requested_reviewers?: User[];
}

export const PullRequestSchema = SchemaFactory.createForClass(PullRequest);
