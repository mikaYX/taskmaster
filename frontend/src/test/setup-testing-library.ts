/**
 * findBy* / waitFor wait 1 s by default. Data that a page loads through a mocked
 * query arrives well within that alone, but not always when every worker runs at
 * once on a busy machine. Same reasoning as testTimeout in vite.config.ts.
 */
import { configure } from '@testing-library/react';

configure({ asyncUtilTimeout: 5_000 });
