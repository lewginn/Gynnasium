import { Decoder, Stream } from '@garmin/fitsdk'
import { readFileSync } from 'node:fs'
import { expect, test } from './fixtures'
import { addExerciseToWorkout, exerciseCard, finishWorkout, setInput, shot, typeInto, waitForLibrary } from './helpers'

test('export a finished workout for Garmin Connect', async ({ page }) => {
  await waitForLibrary(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Start empty workout' }).tap()
  await addExerciseToWorkout(page, 'barbell squat', /^Barbell Squat/)
  const squat = exerciseCard(page, 'Barbell Squat')
  await typeInto(setInput(squat, 1, 'weight'), '100')
  await squat.getByRole('button', { name: 'Complete set 1' }).tap()
  await squat.getByRole('button', { name: 'Complete set 2' }).tap()
  await finishWorkout(page)

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export for Garmin' }).tap()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^\d{4}-\d{2}-\d{2}-workout\.fit$/)
  await expect(page.getByRole('status').filter({ hasText: 'Import Data' })).toBeVisible()
  await shot(page, 'p4-garmin-export')

  const decoder = new Decoder(Stream.fromByteArray(readFileSync(await file.path())))
  expect(decoder.checkIntegrity()).toBe(true)
  const { messages, errors } = decoder.read()
  expect(errors).toEqual([])
  expect(messages.sessionMesgs![0]).toMatchObject({ sport: 'training', subSport: 'strengthTraining' })
  const active = messages.setMesgs!.filter((s) => s.setType === 'active')
  expect(active).toHaveLength(2)
  expect(active[0]).toMatchObject({ category: ['squat'], weight: 100 })
})
