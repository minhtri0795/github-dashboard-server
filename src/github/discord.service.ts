import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class DiscordService {
  private readonly DISCORD_WEBHOOK_URL =
    'https://discord.com/api/webhooks/1316784538982289440/RmqEdwQmgHSVjohiXGTsLCbxvilqVJ5bLD7RAMu_tRPXgZnRb45e2j-Gwz3pnxiYBTr-';

  async sendPROpenedNotification(payload: any) {
    const { title, html_url, user, head, number } = payload.pull_request;

    const message = {
      username: 'PR!',
      avatar_url: user?.avatar_url,
      content: `📢 **${head?.repo?.name?.toUpperCase()}** has new PR!`,
      embeds: [
        {
          author: {
            name: user.login,
            url: user?.html_url,
            icon_url: user?.avatar_url,
          },
          title: `PR #${number}: ${title}`,
          url: html_url,
          color: 16761622,
          fields: [
            {
              name: 'Open by',
              value: user?.login,
              inline: true,
            },
          ],
        },
      ],
    };

    try {
      await axios.post(this.DISCORD_WEBHOOK_URL, message);
      console.log('PR opened notification sent to Discord');
    } catch (error) {
      console.error(
        'Error sending PR opened notification to Discord:',
        error.message,
      );
    }
  }

  async sendPRClosedNotification(payload: any) {
    const { title, html_url, user, merged_by, head, number } =
      payload.pull_request;

    const message = {
      username: 'MERGED!',
      avatar_url: user?.avatar_url,
      content: `\n📢 PR **${head?.repo?.name?.toUpperCase()}** has merged!`,
      embeds: [
        {
          author: {
            name: merged_by?.login,
            url: merged_by?.html_url,
            icon_url: merged_by?.avatar_url,
          },
          title: `PR #${number}: ${title}`,
          description: `[${merged_by?.login}](${merged_by?.html_url}) merged this PR`,
          url: html_url,
          color: 6697980,
          fields: [
            {
              name: 'Open by',
              value: user?.login,
              inline: true,
            },
            {
              name: 'Closed by',
              value: merged_by?.login,
              inline: true,
            },
          ],
        },
      ],
    };

    try {
      await axios.post(this.DISCORD_WEBHOOK_URL, message);
      console.log('PR closed notification sent to Discord');
    } catch (error) {
      console.error(
        'Error sending PR closed notification to Discord:',
        error.message,
      );
    }
  }
}
