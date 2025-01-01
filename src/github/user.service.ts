import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from './schemas/user.schema';

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name)
    private userModel: Model<User>,
  ) {}

  async findOrCreateUser(userData: any) {
    const existingUser = await this.userModel.findOne({
      githubId: userData.id,
    });

    if (existingUser) {
      return existingUser;
    }

    const newUser = await this.userModel.create({
      githubId: userData.id,
      login: userData.login,
      node_id: userData.node_id,
      avatar_url: userData.avatar_url,
      gravatar_id: userData.gravatar_id,
      url: userData.url,
      html_url: userData.html_url,
      followers_url: userData.followers_url,
      following_url: userData.following_url,
      gists_url: userData.gists_url,
      starred_url: userData.starred_url,
      subscriptions_url: userData.subscriptions_url,
      organizations_url: userData.organizations_url,
      repos_url: userData.repos_url,
      events_url: userData.events_url,
      received_events_url: userData.received_events_url,
      type: userData.type,
      site_admin: userData.site_admin,
    });

    return newUser;
  }

  async findById(id: string) {
    return await this.userModel.findById(id);
  }
}
