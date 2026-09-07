import { apiClient } from '@/api/axios';
import { env } from '@/config/env';

const wait = (ms = 500) => new Promise((resolve) => setTimeout(resolve, ms));

const mockDashboard = {
  metrics: [
    {
      label: 'Token projects',
      value: 6,
      change: 2,
      format: 'number',
      helper: '3 active · 2 draft',
    },
    {
      label: 'Deployed tokens',
      value: 3,
      change: 1,
      format: 'number',
      helper: 'Across 2 networks',
    },
    {
      label: 'Verified investors',
      value: 248,
      change: 18,
      format: 'number',
      helper: '92% approval rate',
    },
    {
      label: 'Assets tokenized',
      value: 42800000,
      change: 12.4,
      format: 'currency',
      helper: 'Total issued value',
    },
  ],
  projects: [
    {
      id: 'prj-1',
      name: 'Greenfield Income Fund I',
      symbol: 'GIF1',
      asset: 'Private fund',
      stage: 'Compliance setup',
      progress: 72,
      status: 'In progress',
    },
    {
      id: 'prj-2',
      name: 'Riverside Commercial SPV',
      symbol: 'RCS',
      asset: 'Real estate',
      stage: 'Ready to deploy',
      progress: 100,
      status: 'Ready',
    },
    {
      id: 'prj-3',
      name: 'Atlas Growth Shares',
      symbol: 'AGS',
      asset: 'Startup equity',
      stage: 'Asset details',
      progress: 38,
      status: 'Draft',
    },
  ],
  activity: [
    {
      id: 1,
      title: 'Investor identity verified',
      meta: '0x7a42…2F91 · 8 minutes ago',
      type: 'success',
    },
    {
      id: 2,
      title: 'Compliance rule updated',
      meta: 'Greenfield Income Fund I · 34 minutes ago',
      type: 'info',
    },
    {
      id: 3,
      title: 'Claim requires review',
      meta: 'Accreditation claim · 1 hour ago',
      type: 'warning',
    },
    {
      id: 4,
      title: 'Token transfer completed',
      meta: 'RCS · 1,250 tokens · 3 hours ago',
      type: 'neutral',
    },
  ],
};

export const dashboardApi = {
  async getOverview() {
    if (env.features.mockApi) {
      await wait();
      return mockDashboard;
    }
    const response = await apiClient.get('/dashboard/overview');
    return response.data?.data ?? response.data;
  },
};
