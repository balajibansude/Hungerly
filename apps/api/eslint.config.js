import config from '@hungerly/config/eslint';

export default [...config, { ignores: ['dist/*', 'migrations/*', 'storage/*'] }];
