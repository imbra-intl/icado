import React from 'react';
import { Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

export default function SettingsRedirectPage() {
	const [error, setError] = React.useState<string | null>(null);

	React.useEffect(() => {
		let cancelled = false;

		const redirectToFrappeSettings = async () => {
			try {
				const response = await apiClient.getFrappeSettingsUrl();
				const targetUrl = response.data?.url;

				if (!targetUrl) {
					throw new Error(
						response.error?.message || 'settings URL not available',
					);
				}

				if (!cancelled) {
					const destination = new URL(targetUrl);
					destination.search = window.location.search;
					destination.hash = window.location.hash;
					window.location.replace(destination.toString());
				}
			} catch (err) {
				if (cancelled) {
					return;
				}
				setError(
					err instanceof Error
						? err.message
						: 'Failed to redirect to settings',
				);
			}
		};

		void redirectToFrappeSettings();

		return () => {
			cancelled = true;
		};
	}, []);

	if (error) {
		return (
			<div className="flex min-h-[60vh] items-center justify-center p-6 text-center">
				<div className="space-y-3">
					<p className="text-sm text-red-500">{error}</p>
					<a className="text-sm text-primary underline" href="/">
						Back to home
					</a>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-[60vh] items-center justify-center p-6">
			<div className="flex items-center gap-2 text-sm text-text-secondary">
				<Loader2 className="h-4 w-4 animate-spin" />
				<span>Redirecting to settings...</span>
			</div>
		</div>
	);
}
