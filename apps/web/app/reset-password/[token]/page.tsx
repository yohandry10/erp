import ClientPage from './ClientPage'

export function generateStaticParams() {
  return [{ token: 'reset-token-placeholder' }]
}

export default function Page() {
  return <ClientPage />
}
