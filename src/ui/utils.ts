export function tagParts(
	tag: string,
	parentTag?: string
): {
	tag: string
	label?: string
	title: string
} {
	let temp = tag.slice()

	if (tag.startsWith('#')) {
		temp = temp.slice(1)
	}

	const nestingLevel = parentTag ? parentTag?.split('/').length : 1

	if (temp.contains('/')) {
		const split = temp.split('/')
		const label = split.slice(0, nestingLevel).join('/')
		const title = split.slice(nestingLevel).join('/')

		return {
			tag: tag,
			label: label,
			title: title,
		}
	} else {
		return {
			tag: tag,
			title: temp,
		}
	}
}

export const getRootTag = (tag, depth) => {
	const tagArray = tag.split('/')

	return tagArray.slice(0, depth).join('/')
}
