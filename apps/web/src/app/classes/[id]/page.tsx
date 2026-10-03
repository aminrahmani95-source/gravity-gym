import ClassDetailPage from './class-detail-client';

export function generateStaticParams() {
  return [
    { id: 'class-1' },
    { id: 'class-2' },
  ];
}

export default function Page() {
  return <ClassDetailPage />;
}
