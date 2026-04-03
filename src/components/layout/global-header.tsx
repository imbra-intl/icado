import { useCallback, useEffect, useState } from 'react';
import { AuthButton } from '../auth/auth-button';
import { ThemeToggle } from '../theme-toggle';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/auth-context';
import { ChevronRight, AlertCircle, Coins } from 'lucide-react';
import { usePlatformStatus } from '@/hooks/use-platform-status';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Link, useLocation } from 'react-router';
import clsx from 'clsx';
import { apiClient } from '@/lib/api-client';
import type { UserCreditsData } from '@/api-types';

const BRAND_LOGO_URL = 'https://imbra.co.bw/assets/isaas/logo/imbra-icon.png';

export function GlobalHeader() {
	const { user } = useAuth();
	const { status } = usePlatformStatus();
	const [isChangelogOpen, setIsChangelogOpen] = useState(false);
	const hasMaintenanceMessage = Boolean(status.hasActiveMessage && status.globalUserMessage.trim().length > 0);
	const hasChangeLogs = Boolean(status.changeLogs && status.changeLogs.trim().length > 0);
	const { pathname } = useLocation();
	const [credits, setCredits] = useState<UserCreditsData | null>(null);
	const [isCreditsLoading, setIsCreditsLoading] = useState(false);

	const refreshCredits = useCallback(async () => {
		if (!user) {
			setCredits(null);
			return;
		}

		try {
			setIsCreditsLoading(true);
			const response = await apiClient.getUserCredits();
			if (response.success && response.data) {
				setCredits(response.data);
			}
		} catch (error) {
			console.warn('Failed to fetch credits:', error);
		} finally {
			setIsCreditsLoading(false);
		}
	}, [user]);

	useEffect(() => {
		if (!hasChangeLogs) {
			setIsChangelogOpen(false);
		}
	}, [hasChangeLogs]);

	useEffect(() => {
		if (!user) {
			setCredits(null);
			return;
		}

		void refreshCredits();
		const intervalId = window.setInterval(() => {
			void refreshCredits();
		}, 30000);
		return () => {
			window.clearInterval(intervalId);
		};
	}, [refreshCredits, user]);

	const formattedCredits = (() => {
		if (!credits) return '0';
		const value = credits.totalCredits;
		if (!Number.isFinite(value)) return '0';
		return value.toFixed(value % 1 === 0 ? 0 : 2);
	})();

	return (
		<Dialog open={isChangelogOpen} onOpenChange={setIsChangelogOpen}>
			<motion.header
				initial={{ y: -10, opacity: 0 }}
				animate={{ y: 0, opacity: 1 }}
				transition={{ duration: 0.2, ease: 'easeOut' }}
				className={clsx("sticky top-0 z-50", pathname !== "/" && "bg-bg-3")}
			>
				<div className="relative">
					{/* Subtle gradient accent */}
					<div className="absolute inset-0 z-0" />

					{/* Main content */}
					<div className="relative z-10 grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-2">
						{/* Left section */}
						{user ? (
							<motion.div
								whileTap={{ scale: 0.95 }}
								transition={{
									type: 'spring',
									stiffness: 400,
									damping: 17,
								}}
								className='flex items-center'
							>
								<Link to="/" aria-label="Go to home" className="flex items-center">
									<img
										src={BRAND_LOGO_URL}
										alt="Imbra"
										className="h-7 w-7 flex-shrink-0 rounded-sm object-contain transition-all duration-300"
									/>
								</Link>
								<Link
									to="/discover"
									className="ml-4 text-sm font-medium text-text-primary/80 hover:text-text-primary transition-colors"
								>
									Discover
								</Link>
								{hasMaintenanceMessage && (
									<button
										type="button"
										onClick={hasChangeLogs ? () => setIsChangelogOpen(true) : undefined}
										disabled={!hasChangeLogs}
										className={`flex max-w-full items-center gap-2 rounded-full border border-accent/40 bg-bg-4/80 px-3 ml-4 py-1.5 text-xs text-text-primary shadow-sm backdrop-blur transition-colors hover:bg-accent/10 focus:outline-none focus:ring-2 focus:ring-accent/40 dark:border-accent/30 dark:bg-bg-2/80 md:text-sm${!hasChangeLogs ? ' opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
										aria-label="Platform updates"
									>
										<AlertCircle className="h-4 w-4 text-accent" />
										<span className="truncate max-w-[46ch] md:max-w-[60ch]">{status.globalUserMessage}</span>
										<ChevronRight className="ml-1 h-4 w-4 text-accent" />
									</button>
								)}
							</motion.div>
						) : (
							<div></div>
						)}



						{/* Right section */}
						<motion.div
							initial={{ opacity: 0, x: 10 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{ delay: 0.2 }}
							className="flex flex-wrap items-center justify-end gap-3 justify-self-end"
						>
							{user && (
								<div className="flex items-center gap-2 rounded-full border border-accent/30 bg-bg-4/80 px-3 py-1.5 text-xs text-text-primary shadow-sm backdrop-blur">
									<Coins className="h-3.5 w-3.5 text-accent" />
									<span className="font-medium">
										{isCreditsLoading ? 'Credits...' : `${formattedCredits} credits`}
									</span>
									{credits?.topupUrl && (
										<a
											href={credits.topupUrl}
											className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-white hover:bg-accent/90 transition-colors"
										>
											Top up
										</a>
									)}
								</div>
							)}
							{/* Disable cost display for now */}
							{/* {user && (
							<CostDisplay
								{...extractUserAnalyticsProps(analytics)}
								loading={analyticsLoading}
								variant="inline"
							/>
						)} */}
							<ThemeToggle />
							<AuthButton />
						</motion.div>
					</div>
				</div>
			</motion.header>
			{hasChangeLogs && (
				<DialogContent className="max-w-xl">
					<DialogHeader>
						<DialogTitle>Platform updates</DialogTitle>
						{status.globalUserMessage && (
							<DialogDescription className="text-sm text-muted-foreground">
								{status.globalUserMessage}
							</DialogDescription>
						)}
					</DialogHeader>
					<ScrollArea className="max-h-[60vh] pr-4">
						<p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
							{status.changeLogs}
						</p>
					</ScrollArea>
				</DialogContent>
			)}
		</Dialog>
	);
}
