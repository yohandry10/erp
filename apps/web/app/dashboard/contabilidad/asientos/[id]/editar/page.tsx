import ClientPage from './ClientPage'

export async function generateStaticParams() {
  return [{ id: 'placeholder' }]
}

export default function Page() {
  return <ClientPage />
}
