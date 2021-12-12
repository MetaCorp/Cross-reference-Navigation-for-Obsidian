import clone from 'clone'
import { getAllTags, Plugin, TFile } from 'obsidian'
import { get, Readable, writable } from 'svelte/store'
import { getRootTag, tagParts } from './utils'

export interface StoredSettings {
	favoriteGroups: string[]
	favoriteTags: string[]
}

export const defaultSettings: StoredSettings = {
	favoriteGroups: ['status', 'activity'],
	favoriteTags: [],
}

export interface SettingsStore extends Readable<StoredSettings> {
	toggleFavoriteGroup(group: string): void
	toggleFavoriteTag(tag: string): void
}

export async function createSettingsStore(
	plugin: Plugin
): Promise<SettingsStore> {
	const initialData = await plugin.loadData()
	const { subscribe, update } = writable<StoredSettings>({
		...defaultSettings,
		...initialData,
	})

	function toggleFavoriteGroup(group: string) {
		update((settings) => {
			const favoriteGroups = settings.favoriteGroups

			const index = favoriteGroups.indexOf(group)

			if (index > -1) {
				favoriteGroups.splice(index, 1)
			} else {
				favoriteGroups.push(group)
			}

			const newState = {
				...settings,
				favoriteGroups,
			}

			plugin.saveData(newState)
			return newState
		})
	}

	function toggleFavoriteTag(tag: string) {
		update((settings) => {
			const favoriteTags = settings.favoriteTags

			const index = favoriteTags.indexOf(tag)

			if (index > -1) {
				favoriteTags.splice(index, 1)
			} else {
				favoriteTags.push(tag)
			}

			const newState = {
				...settings,
				favoriteTags,
			}

			plugin.saveData(newState)
			return newState
		})
	}

	return {
		subscribe,
		toggleFavoriteGroup,
		toggleFavoriteTag,
	}
}

export interface TagMenuState {
	toShow: {
		[group: string]: {
			[tag: string]: {
				displayName: string
				files: TFile[]
				crossrefs: { [tag: string]: number }
				subrefs: {
					[tag: string]: {
						displayName: string
						files: TFile[]
					}
				}
			}
		}
	}
	groupsSorted: string[]
	tagsSorted: { [group: string]: string[] }
	crossrefsSorted: { [group: string]: { [tag: string]: string[] } }
	subrefsSorted: { [group: string]: { [tag: string]: string[] } }
	allMatchingFiles: TFile[]
	selectedTags: string[]
	expandedGroups: string[]
}

function generateInitialTagMenuState(): TagMenuState {
	return {
		toShow: {},
		groupsSorted: [],
		tagsSorted: {},
		crossrefsSorted: {},
		subrefsSorted: {},
		allMatchingFiles: [],
		selectedTags: [],
		expandedGroups: [''], // always expand ungrouped tags section
	}
}

export interface TagMenuStore extends Readable<TagMenuState> {
	selectTags(selectTags: string[]): void
	toggleExpandedGroup(group: string): void
	destroy(): void
	loadState(selectedTags: string[], expandedGroups: string[]): void
}

export function createTagMenuStore(settingsStore: SettingsStore): TagMenuStore {
	const { subscribe, set, update } = writable<TagMenuState>(
		generateInitialTagMenuState()
	)

	function selectTags(selectTags: string[]) {
		console.log('selectTags 0', { selectTags })

		const newState = generateInitialTagMenuState()
		newState.selectedTags = selectTags

		const groupCounts: { [group: string]: number } = {}
		const tagCounts: { [group: string]: { [tag: string]: number } } = {}

		const allFiles = window.app.vault.getMarkdownFiles()
		const allFileTags: { [fname: string]: string[] } = {}
		allFiles.forEach((file) => {
			// Get file tags from Obsidian Cache
			const fileTags = getAllTags(window.app.metadataCache.getFileCache(file))
			allFileTags[file.name] = fileTags

			// I think this is where it filters files based on breadcrumbs state
			if (selectTags.every((t) => fileTags.includes(t))) {
				newState.allMatchingFiles.push(file)

				fileTags.forEach((tag) => {
					if (selectTags.includes(tag)) {
						return
					}

					const parts = tagParts(tag)
					const label = parts.label || ''
					const title = parts.title

					if (!newState.toShow[label]) {
						newState.toShow[label] = {}
					}

					if (!newState.toShow[label][tag]) {
						newState.toShow[label][tag] = {
							displayName: title,
							files: [],
							crossrefs: {},
							subrefs: {},
						}
					}

					// This is a big dico that is displayed
					newState.toShow[label][tag].files.push(file)

					// And this compute the number of files/groups
					if (!tagCounts[label]) {
						tagCounts[label] = {}
					}

					groupCounts[label] = (groupCounts[label] || 0) + 1
					tagCounts[label][tag] = (tagCounts[label][tag] || 0) + 1
				})
			}
		})

		console.log({ newState })
		// Remove subrefs from toShow dico and add them in toShow.{REF}.subrefs
		const toShowClone = clone(newState.toShow, true, 5)
		console.log({ toShowClone })
		Object.keys(newState.toShow).forEach((group) => {
			Object.keys(newState.toShow[group]).forEach((tag) => {
				const parentTag = getRootTag(tag, 2)
				if (tag === parentTag) return

				if (newState.toShow[group][parentTag]) {
					console.log({ group, tag, parentTag })
					// if (!toShowClone[group][parentTag].subrefs) {
					// 	toShowClone[group][parentTag].subrefs = {}
					// }

					toShowClone[group][parentTag].subrefs[tag] =
						newState.toShow[group][tag]

					// Add subcrossrefs to parentTag, then delete tag crossrefs
					Object.keys(newState.toShow[group][tag].crossrefs).forEach(
						(subcrossref) => {
							toShowClone[group][parentTag].crossrefs[subcrossref] =
								(toShowClone[group][parentTag].crossrefs[subcrossref] || 0) +
								newState.toShow[group][tag].crossrefs[subcrossref]
						}
					)
					toShowClone[group][parentTag].files.push(
						...toShowClone[group][parentTag].subrefs[tag].files
					)

					delete toShowClone[group][parentTag].subrefs[tag].crossrefs

					delete toShowClone[group][tag]
				}
			})
		})
		newState.toShow = toShowClone

		// Generate groupsSorted
		newState.groupsSorted = Object.keys(newState.toShow).sort(
			(a, b) =>
				groupCounts[b] +
				Object.keys(tagCounts[b] || {}).length -
				(groupCounts[a] + Object.keys(tagCounts[a] || {}).length)
		) // tagCounts included to prioritize groups that have more columns

		const settingsState = get(settingsStore)
		const _favoriteGroups = settingsState.favoriteGroups.sort(
			(a, b) =>
				(groupCounts[a] || 0) +
				Object.keys(tagCounts[a] || {}).length -
				(groupCounts[b] || 0) +
				Object.keys(tagCounts[b] || {}).length
		)
		_favoriteGroups.forEach((group) => {
			const index = newState.groupsSorted.indexOf(group)

			if (index > -1) {
				newState.groupsSorted.splice(index, 1)
				newState.groupsSorted.unshift(group)
			}
		})

		// Put list of all ungrouped tags at bottom, it will always be expanded
		const index = newState.groupsSorted.indexOf('')
		if (index > -1) {
			newState.groupsSorted.splice(index, 1)
			newState.groupsSorted.push('')
		}

		// Put list of favorite tags at top
		if (settingsState.favoriteTags.length > 0 && newState.toShow['']) {
			newState.groupsSorted.unshift('favorite tags')
			newState.toShow['favorite tags'] = {}
			tagCounts['favorite tags'] = {}

			settingsState.favoriteTags.forEach((tag) => {
				if (newState.toShow[''][tag]) {
					newState.toShow['favorite tags'][tag] = newState.toShow[''][tag]
					delete newState.toShow[''][tag]

					tagCounts['favorite tags'][tag] = tagCounts[''][tag]
					delete tagCounts[''][tag]
				}
			})
		}

		// Generate tagsSorted, crossrefs
		Object.keys(newState.toShow).forEach((group) => {
			newState.tagsSorted[group] = Object.keys(newState.toShow[group]).sort(
				(a, b) => tagCounts[group][b] - tagCounts[group][a]
			)

			Object.keys(newState.toShow[group]).forEach((tag) => {
				const files = newState.toShow[group][tag].files
				const crossrefs: { [index: string]: number } = {}
				files.forEach((file) => {
					allFileTags[file.name].forEach((tag2) => {
						if (tag2 === tag) {
							return
						}
						if (selectTags.includes(tag2)) {
							return
						}
						crossrefs[tag2] = (crossrefs[tag2] || 0) + 1
					})
				})
				newState.toShow[group][tag].crossrefs = crossrefs
			})
		})

		// Generate crossrefsSorted
		Object.keys(newState.toShow).forEach((group) => {
			newState.crossrefsSorted[group] = {}
			Object.keys(newState.toShow[group]).forEach((tag) => {
				const crossrefs = newState.toShow[group][tag].crossrefs
				const sorted = Object.keys(crossrefs).sort(
					(a, b) => crossrefs[b] - crossrefs[a]
				)

				sorted
					.slice()
					.reverse()
					.forEach((tag) => {
						if (
							settingsState.favoriteTags.find((ftag) => tag === ftag) ||
							settingsState.favoriteGroups.find((fgroup) =>
								tag.startsWith('#' + fgroup)
							)
						) {
							sorted.splice(sorted.indexOf(tag), 1)
							sorted.unshift(tag)
						}
					})

				newState.crossrefsSorted[group][tag] = sorted
			})
		})

		// Generate subrefsSorted
		Object.keys(newState.toShow).forEach((group) => {
			newState.subrefsSorted[group] = {}
			Object.keys(newState.toShow[group]).forEach((tag) => {
				const subrefs = newState.toShow[group][tag].subrefs
				const sorted = Object.keys(subrefs).sort(
					(a, b) => subrefs[b].files.length - subrefs[a].files.length
				)

				sorted
					.slice()
					.reverse()
					.forEach((tag) => {
						if (
							settingsState.favoriteTags.find((ftag) => tag === ftag) ||
							settingsState.favoriteGroups.find((fgroup) =>
								tag.startsWith('#' + fgroup)
							)
						) {
							sorted.splice(sorted.indexOf(tag), 1)
							sorted.unshift(tag)
						}
					})

				newState.subrefsSorted[group][tag] = sorted
			})
		})

		console.log('selectTags', { selectTags, newState })

		set(newState)
	}

	function toggleExpandedGroup(group: string) {
		update((state) => {
			const expandedGroups = state.expandedGroups

			const index = expandedGroups.indexOf(group)

			if (index > -1) {
				expandedGroups.splice(index, 1)
			} else {
				expandedGroups.push(group)
			}

			return {
				...state,
				expandedGroups,
			}
		})
	}

	function loadState(selectedTags: string[], expandedGroups: string[]) {
		if (selectedTags) {
			selectTags(selectedTags)
		}

		if (expandedGroups) {
			update((state) => ({
				...state,
				expandedGroups,
			}))
		}
	}

	const unsubscribe = settingsStore.subscribe((_) => {
		selectTags(get({ subscribe }).selectedTags)
	})
	const destroy = unsubscribe

	return { subscribe, destroy, loadState, selectTags, toggleExpandedGroup }
}
