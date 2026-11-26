import { Suspense } from "react";
import Link from "next/link";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Icon } from "@/components/ui/icon";
import { CountBadge } from "@/components/ui/badge";
import { brand } from "@/config/brand";
import { placeholderClaimsVisible } from "@/config/claims";
import { MobileMenu } from "./mobile-menu";
import { PrimaryNav } from "./primary-nav";
import { HeaderSearch } from "./header-search";

const iconLink = "relative w-10 h-10 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-container transition-colors duration-state-change";

export function StoreHeader({ cartCount = 0, signedIn = false }: { cartCount?: number; signedIn?: boolean }) {
  const showClaims = placeholderClaimsVisible();
  const cartLabel = `Shopping Bag with ${cartCount} ${cartCount === 1 ? "item" : "items"}`;
  return (
    <>
      {showClaims && (
        <div className="bg-secondary text-on-secondary py-2 lg:py-2.5 px-4 lg:px-6 text-center">
          <p className="font-label text-label-sm uppercase tracking-wider">
            <span className="lg:hidden">{brand.announcementShort}</span>
            <span className="hidden lg:inline">{brand.announcement}</span>
          </p>
        </div>
      )}
      <header className="sticky top-0 z-40 bg-surface border-b border-outline">
        {/* Mobile bar */}
        <div className="lg:hidden px-4 h-16 flex items-center justify-between">
          <MobileMenu />
          <Link href="/" className="font-headline text-title-lg tracking-tight text-on-surface">{brand.mobileWordmark}</Link>
          <div className="flex items-center gap-1">
            <HeaderSearch className="w-9 h-9" />
            <ThemeToggle className="w-9 h-9 border-0" />
            {signedIn ? (
              <NotificationBell allNotificationsHref="/account/notifications" className="w-9 h-9" />
            ) : null}
            <Link href="/cart" aria-label={cartLabel} className="relative w-9 h-9 rounded-full flex items-center justify-center text-on-surface">
              <Icon name="shopping_bag" />
              {cartCount > 0 && <CountBadge count={cartCount} className="top-0.5 right-0.5 min-w-4 h-4" />}
            </Link>
          </div>
        </div>
        {/* Desktop bar */}
        <div className="hidden lg:flex max-w-7xl mx-auto px-6 h-20 items-center justify-between gap-8">
          <Logo />
          <Suspense fallback={<PrimaryNav interactive={false} />}>
            <PrimaryNav />
          </Suspense>
          <div className="flex items-center gap-3">
            <HeaderSearch />
            <ThemeToggle />
            {signedIn ? (
              <NotificationBell allNotificationsHref="/account/notifications" />
            ) : null}
            <Link href={signedIn ? "/account" : "/login"} aria-label={signedIn ? "Customer Account" : "Sign In"} className={iconLink}><Icon name="person" filled={signedIn} /></Link>
            <Link href="/account/wishlist" aria-label="Wishlist" className={iconLink}><Icon name="favorite_border" /></Link>
            <Link href="/cart" aria-label={cartLabel} className={iconLink}>
              <Icon name="shopping_bag" />
              {cartCount > 0 && <CountBadge count={cartCount} />}
            </Link>
          </div>
        </div>
      </header>
    </>
  );
}
