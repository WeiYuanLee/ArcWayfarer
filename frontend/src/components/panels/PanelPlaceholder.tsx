type Props = {
  title: string
  description: string
}

export function PanelPlaceholder({ title, description }: Props) {
  return (
    <div className="panel">
      <h2>{title}</h2>
      <p className="panel-description">{description}</p>
    </div>
  )
}
