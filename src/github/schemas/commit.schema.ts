import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { User } from './user.schema';

@Schema({ timestamps: true, collection: 'commits' })
export class Commit extends Document {
  @Prop()
  sha: string;

  @Prop()
  node_id: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  author: User;

  @Prop()
  message: string;

  @Prop()
  url: string;

  @Prop()
  html_url: string;

  @Prop()
  comments_url: string;

  @Prop({ type: Object })
  repository: {
    id: number;
    node_id: string;
    name: string;
    full_name: string;
    private: boolean;
  };

  @Prop()
  branch: string;

  @Prop({ type: [String] })
  added: string[];

  @Prop({ type: [String] })
  removed: string[];

  @Prop({ type: [String] })
  modified: string[];

  @Prop()
  created_at: Date;

  @Prop({ type: Object })
  stats: {
    total: number;
    additions: number;
    deletions: number;
  };
}

export const CommitSchema = SchemaFactory.createForClass(Commit);
