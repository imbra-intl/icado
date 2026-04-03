import React from 'react';
import clsx from 'clsx';
import { Link } from 'react-router';

const BRAND_LOGO_URL = 'https://imbra.co.bw/assets/isaas/logo/imbra-icon.png';

export function Header({
	className,
	children,
}: React.ComponentProps<'header'>) {
	return (
		<header
			className={clsx(
				'h-13 shrink-0 w-full px-4 border-b flex items-center',
				className,
			)}
		>
			<h1 className="flex items-center gap-2 mx-4">
				<Link to="/" aria-label="Go to home">
					<img
						src={BRAND_LOGO_URL}
						alt="Imbra"
						className="h-6 w-6 rounded-sm object-contain"
					/>
				</Link>
			</h1>
			<div className="flex-1"></div>
			<div className="flex items-center gap-4">
				{children}
			</div>
		</header>
	);
}
