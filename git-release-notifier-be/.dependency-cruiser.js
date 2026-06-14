/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Циклічні залежності заборонені (DIP / single responsibility).',
      from: {},
      to: { circular: true },
    },
    {
      name: 'modules-not-to-workers',
      severity: 'error',
      comment: 'Напрямок лише workers -> modules. modules не залежить від workers.',
      from: { path: '^src/modules/' },
      to: { path: '^src/workers/' },
    },
    {
      name: 'lib-is-leaf',
      severity: 'error',
      comment: 'lib — листок дерева залежностей: не імпортує modules/workers/composition.',
      from: { path: '^src/lib/' },
      to: { path: '^src/(modules|workers|composition)/' },
    },
    {
      name: 'modules-public-api-only',
      severity: 'error',
      comment:
        'Між модулями — лише через публічну поверхню (interfaces/, types/) або shared-kernel common. Внутрішні файли чужого модуля імпортувати не можна.',
      from: { path: '^src/modules/([^/]+)/', pathNot: '[.](?:spec|test)[.][cm]?[jt]sx?$' },
      to: {
        path: '^src/modules/',
        pathNot: [
          '^src/modules/$1/',
          '^src/modules/[^/]+/(?:interfaces|types)/',
          '^src/modules/common/',
        ],
      },
    },
    {
      name: 'workers-use-module-public-api',
      severity: 'error',
      comment: 'Воркер споживає модулі лише через interfaces/ та types/ (або common).',
      from: { path: '^src/workers/', pathNot: '[.](?:spec|test)[.][cm]?[jt]sx?$' },
      to: {
        path: '^src/modules/',
        pathNot: ['^src/modules/[^/]+/(?:interfaces|types)/', '^src/modules/common/'],
      },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment: 'Імпорт указує на модуль, який не вдалося знайти на диску (зламаний шлях/опечатка).',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'not-to-spec',
      severity: 'error',
      comment: 'Робочий код не повинен залежати від тестових (.spec/.test) файлів.',
      from: {},
      to: { path: '[.](?:spec|test)[.](?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$' },
    },
    {
      name: 'no-non-package-json',
      severity: 'error',
      comment: 'Залежність від npm-пакета, якого немає в package.json — додай його у dependencies.',
      from: {},
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] },
    },
    {
      name: 'not-to-dev-dep',
      severity: 'error',
      comment: 'Робочий код залежить від devDependency. Або перенеси пакет у dependencies, або файл у тести/конфіг.',
      from: {
        path: '^src/',
        pathNot: [
          '[.](?:spec|test)[.](?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$',
          '^src/tests/',
          '^src/scripts/',
          '[.]config[.](?:js|cjs|mjs|ts|cts|mts)$',
        ],
      },
      to: {
        dependencyTypes: ['npm-dev'],
        dependencyTypesNot: ['type-only'],
        pathNot: ['node_modules/@types/'],
      },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Модуль-сирота: ніхто його не використовує. Або застосуй, або видали.',
      from: {
        orphan: true,
        pathNot: ['[.]d[.]ts$', '(^|/)tsconfig[.]json$', '(^|/)[.][^/]+[.](?:js|cjs|mjs|ts)$'],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: ['node_modules'] },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    reporterOptions: {
      dot: { collapsePattern: '^src/[^/]+/[^/]+' },
      text: { highlightFocused: true },
    },
  },
};
