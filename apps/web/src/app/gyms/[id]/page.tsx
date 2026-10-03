import GymDetailPage from './gym-detail-client';

export function generateStaticParams() {
  return [
    { id: 'gym-elite-4' },
    { id: 'gym-basic-1' },
    { id: 'gym-plus-2' },
    { id: 'gym-premium-3' },
  ];
}

export default function Page() {
  return <GymDetailPage />;
}
