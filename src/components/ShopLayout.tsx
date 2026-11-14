import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useI18n } from '../i18n'
import { CategoryBar } from './CategoryBar'
import { Footer } from './Footer'
import { Header } from './Header'

export function ShopLayout() {
  const { t } = useI18n()
  const { pathname } = useLocation()
  // scroll to top on page change (not on filter changes, which only touch the query string)
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return (
    <div className="shop">
      <a href="#main" className="skip">
        {t('common.skip')}
      </a>
      <Header />
      <CategoryBar />
      <main id="main" className="container main">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
