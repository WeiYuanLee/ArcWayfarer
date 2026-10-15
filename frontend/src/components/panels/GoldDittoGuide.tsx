import { IconCheck, IconFlower, IconHandFinger, IconMapPin, IconSparkles } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { useT } from '../../i18n'
import './GoldDittoGuide.css'

export type GoldDittoPhase = 'setup' | 'holding' | 'countdown' | 'finishing' | 'complete'

type Props = {
  phase: GoldDittoPhase
  countdown: number | null
  setupControls?: ReactNode
}

const stepForPhase: Record<GoldDittoPhase, number> = {
  setup: 0,
  holding: 1,
  countdown: 2,
  finishing: 2,
  complete: 2,
}

export function GoldDittoGuide({ phase, countdown, setupControls }: Props) {
  const t = useT()
  const activeStep = stepForPhase[phase]
  const steps = [
    t('teleport.goldditto.guide.step.fly'),
    t('teleport.goldditto.guide.step.open'),
    t('teleport.goldditto.guide.step.pull'),
  ]

  return (
    <section className={`gold-guide gold-guide--${phase}`} aria-live="polite">
      <div className="gold-guide__steps" aria-label={t('teleport.goldditto.guide.progress')}>
        {steps.map((label, index) => (
          <div
            className="gold-guide__step"
            data-active={index === activeStep || undefined}
            data-done={(index < activeStep || phase === 'complete') || undefined}
            key={label}
          >
            <span className="gold-guide__step-dot">{index < activeStep || phase === 'complete' ? <IconCheck size={12} /> : index + 1}</span>
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div className="gold-guide__scene" key={phase === 'countdown' || phase === 'finishing' ? 'pulling' : phase}>
        {phase === 'setup' && (
          <>
            <div className="gold-guide__route" aria-hidden="true">
              <span className="gold-guide__origin"><IconMapPin size={20} /></span>
              <span className="gold-guide__route-line"><i /></span>
              <span className="gold-guide__flower"><IconFlower size={30} /></span>
            </div>
            <h3>{t('teleport.goldditto.guide.setup.title')}</h3>
            <p>{t('teleport.goldditto.guide.setup.description')}</p>
          </>
        )}

        {phase === 'holding' && (
          <>
            <div className="gold-guide__phone" aria-hidden="true">
              <span className="gold-guide__pulse gold-guide__pulse--one" />
              <span className="gold-guide__pulse gold-guide__pulse--two" />
              <IconFlower size={42} />
            </div>
            <h3>{t('teleport.goldditto.guide.holding.title')}</h3>
            <p>{t('teleport.goldditto.guide.holding.description')}</p>
          </>
        )}

        {(phase === 'countdown' || phase === 'finishing') && (
          <>
            <div className="gold-guide__pull" aria-hidden="true">
              <IconFlower className="gold-guide__pull-flower" size={42} />
              <span className="gold-guide__pull-track" />
              <IconHandFinger className="gold-guide__pull-hand" size={34} />
              <strong>
                {phase === 'countdown'
                  ? (countdown ?? 1)
                  : <span className="gold-guide__pull-spinner" />}
              </strong>
            </div>
            <h3>{t('teleport.goldditto.guide.countdown.title')}</h3>
            <p>{t(phase === 'countdown'
              ? 'teleport.goldditto.guide.countdown.description'
              : 'teleport.goldditto.guide.finishing.description')}</p>
          </>
        )}

        {phase === 'complete' && (
          <>
            <div className="gold-guide__complete" aria-hidden="true">
              <IconCheck size={38} />
              <IconSparkles className="gold-guide__sparkle" size={24} />
            </div>
            <h3>{t('teleport.goldditto.guide.complete.title')}</h3>
            <p>{t('teleport.goldditto.guide.complete.description')}</p>
          </>
        )}

        {(phase === 'setup' || phase === 'complete') && setupControls}
      </div>
    </section>
  )
}
