import { Link } from 'react-router-dom';
import { EmptyState, PageHeader } from '../components/ui';
import './analytics.css';

export default function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page not found" />
      <EmptyState title="This page does not exist in the demo">
        <Link to="/">Back to Overview</Link>
      </EmptyState>
    </>
  );
}
