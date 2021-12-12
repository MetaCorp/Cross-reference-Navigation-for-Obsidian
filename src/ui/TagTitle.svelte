<script lang="ts">
	import { tagParts } from './utils'

	export let tag: string
	export let parentTag: string = undefined
	export let inline: boolean = false
	export let strong: boolean = false
	export let forceTwoLines: boolean = false

	let label: string
	let title: string
	$: recalc(tag, parentTag)

	function recalc(tag: string, parentTag?: string) {
		let parts = tagParts(tag, parentTag)
		label = parts.label
		title = parts.title
	}
</script>

{#if !inline}
	<div class={strong ? 'strong' : ''}>
		<p class="small muted">{label ? label + '/' : forceTwoLines ? '-' : ''}</p>
		<p>{title}</p>
	</div>
{:else}
	<p class={strong ? 'strong' : ''}>
		<span class="muted">{label ? label + '/' : ''}</span>{title}
	</p>
{/if}

<style>
	p {
		margin: 0;
	}

	.strong {
		font-weight: bold;
	}

	.small {
		font-size: 12px;
		line-height: 14px;
	}

	.muted {
		opacity: 0.5;
	}
</style>
