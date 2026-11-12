import { Link } from 'react-router-dom';
import { EmptyState, PageHeader, buttonClass } from '../components/ui';

export default function NotFoundPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Page not found" />
      <EmptyState
        title="This page does not exist in the demo"
        action={
          <Link to="/" className={buttonClass('primary')}>
            Back to Overview
          </Link>
        }
      >
        Use the menu on the left to open one of the demo pages.
      </EmptyState>
    </div>
  );
}
