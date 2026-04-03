import { useEffect, useRef } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '@/contexts/auth-context';

export default function Home() {
	const { isAuthenticated, isLoading, login } = useAuth();
	const hasTriggeredAutoLogin = useRef(false);

	useEffect(() => {
		if (isLoading || isAuthenticated || hasTriggeredAutoLogin.current) {
			return;
		}

		hasTriggeredAutoLogin.current = true;

		login('frappe', '/apps');
	}, [isAuthenticated, isLoading, login]);

	if (isAuthenticated) {
		return <Navigate to="/apps" replace />;
	}

	return (
		<div className="flex min-h-[60vh] items-center justify-center px-6">
			<p className="text-sm text-text-tertiary">
				Redirecting to your workspace...
			</p>
		</div>
	);
}
