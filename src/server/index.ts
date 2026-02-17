import { startServer } from './api';

const port = parseInt(process.env.PORT || '3000');
const enableESPN = process.env.ESPN_POLLING === 'true';

startServer(port, {
  enableESPN,
  enableLiveLoop: true,
});
