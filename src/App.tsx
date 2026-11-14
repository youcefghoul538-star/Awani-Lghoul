import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ADMIN_PATH } from './admin/base'
import { ShopLayout } from './components/ShopLayout'
import { ToastProvider } from './components/Toast'
import { useDocumentLang } from './i18n'
import { CatalogGate } from './components/CatalogGate'
import Home from './pages/Home'

// The admin area (and the private wholesale pricing code) is a separate lazy chunk:
// it is never downloaded by storefront visitors.
const AdminApp = lazy(() => import('./admin/AdminApp'))
// Secondary storefront routes are split out of the initial bundle.
const Packs = lazy(() => import('./pages/Packs'))
const ProductPage = lazy(() => import('./pages/ProductPage'))
const Cart = lazy(() => import('./pages/Cart'))
const Checkout = lazy(() => import('./pages/Checkout'))
const QuoteRequest = lazy(() => import('./pages/QuoteRequest'))
const Contact = lazy(() => import('./pages/Contact'))
const OrderConfirmation = lazy(() => import('./pages/Confirmation').then((m) => ({ default: m.OrderConfirmation })))
const QuoteConfirmation = lazy(() => import('./pages/Confirmation').then((m) => ({ default: m.QuoteConfirmation })))
const gate = (el: ReactNode) => (
  <Suspense fallback={null}>
    <CatalogGate>{el}</CatalogGate>
  </Suspense>
)
const lazyEl = (el: ReactNode) => <Suspense fallback={null}>{el}</Suspense>

export default function App() {
  useDocumentLang()
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route element={<ShopLayout />}>
            <Route index element={gate(<Home />)} />
            <Route path="packs" element={gate(<Packs />)} />
            <Route path="produit/:id" element={gate(<ProductPage />)} />
            <Route path="panier" element={gate(<Cart />)} />
            <Route path="commande" element={gate(<Checkout />)} />
            <Route path="confirmation/:ref" element={lazyEl(<OrderConfirmation />)} />
            <Route path="devis" element={gate(<QuoteRequest />)} />
            <Route path="devis/confirmation/:ref" element={lazyEl(<QuoteConfirmation />)} />
            <Route path="contact" element={lazyEl(<Contact />)} />
            <Route path="*" element={gate(<Home />)} />
          </Route>
          <Route
            path={`${ADMIN_PATH}/*`}
            element={
              <Suspense fallback={null}>
                <AdminApp />
              </Suspense>
            }
          />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  )
}
