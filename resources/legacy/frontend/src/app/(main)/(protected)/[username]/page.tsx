'use client';
import { use } from 'react';
import Dashboard from '../../../../components/dashboard/DashBoard';

const Page = (props: { params: Promise<{ username: string }> }) => {
  const { username } = use(props.params);
  return <Dashboard username={username} />;
};

export default Page;
