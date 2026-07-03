export interface Config {
  port: number;
  dbPath: string;
  apiToken: string | null;
  baseUrl: string;
  slack: {
    botToken: string;
    appToken: string;
    signingSecret: string;
    defaultChannel: string | null;
  } | null;
  escalationSweepSeconds: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const botToken = env.SLACK_BOT_TOKEN?.trim() || '';
  const appToken = env.SLACK_APP_TOKEN?.trim() || '';
  const signingSecret = env.SLACK_SIGNING_SECRET?.trim() || '';
  const slackConfigured = Boolean(botToken && appToken && signingSecret);

  return {
    port: parseInt(env.PORT || '3000', 10),
    dbPath: env.DB_PATH || './data/opsly.db',
    apiToken: env.API_TOKEN?.trim() || null,
    baseUrl: (env.BASE_URL || `http://localhost:${env.PORT || '3000'}`).replace(/\/+$/, ''),
    slack: slackConfigured
      ? {
          botToken,
          appToken,
          signingSecret,
          defaultChannel: env.SLACK_DEFAULT_CHANNEL?.trim() || null,
        }
      : null,
    escalationSweepSeconds: Math.max(5, parseInt(env.ESCALATION_SWEEP_SECONDS || '15', 10)),
  };
}
