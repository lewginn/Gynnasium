import Icon from '../components/Icon'
import Page from '../components/Page'

export default function PlansPage() {
  return (
    <Page title="Plans">
      <section className="empty">
        <Icon name="plans" size={52} />
        <h2>No plans yet</h2>
        <p>The plan builder, with exercise suggestions for each day, is coming in the next update.</p>
      </section>
    </Page>
  )
}
