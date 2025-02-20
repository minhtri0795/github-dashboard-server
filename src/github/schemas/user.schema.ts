import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'users' })
export class User extends Document {
  @Prop({ required: true, unique: true })
  githubId: number;

  @Prop({ required: true })
  login: string;

  @Prop()
  node_id?: string;

  @Prop()
  avatar_url?: string;

  @Prop()
  gravatar_id?: string;

  @Prop()
  url?: string;

  @Prop()
  html_url?: string;

  @Prop()
  followers_url?: string;

  @Prop()
  following_url?: string;

  @Prop()
  gists_url?: string;

  @Prop()
  starred_url?: string;

  @Prop()
  subscriptions_url?: string;

  @Prop()
  organizations_url?: string;

  @Prop()
  repos_url?: string;

  @Prop()
  events_url?: string;

  @Prop()
  received_events_url?: string;

  @Prop()
  type: string;

  @Prop()
  site_admin?: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
