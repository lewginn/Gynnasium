import Icon from '../components/Icon'
import Page from '../components/Page'

export default function ProgressPage() {
  return (
    <Page title="Progress">
      <section className="empty">
        <Icon name="chart" size={52} />
        <h2>Nothing to show yet</h2>
        <p>Once you log workouts, your estimated 1RM trends, PRs and body metrics appear here.</p>
      </section>
    </Page>
  )
}
