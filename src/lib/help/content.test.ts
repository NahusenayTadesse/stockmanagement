import { describe, expect, it } from 'vitest';
import { HELP_SECTIONS, HELP_TOPICS, searchText, topicsForPath, type Text } from './content';
import { TOURS, tourById } from './tours';
import { access } from '$lib/access';

const both = (text: Text) => text.en.trim().length > 0 && text.am.trim().length > 0;

describe('help content', () => {
	it('gives every article both languages, a known area and a unique id', () => {
		const ids = new Set<string>();
		for (const topic of HELP_TOPICS) {
			expect(ids.has(topic.id), topic.id).toBe(false);
			ids.add(topic.id);
			expect(
				HELP_SECTIONS.some((s) => s.id === topic.section),
				topic.id
			).toBe(true);
			for (const text of [
				topic.title,
				topic.summary,
				...(topic.steps ?? []),
				...(topic.notes ?? [])
			]) {
				expect(both(text), `${topic.id}: ${text.en}`).toBe(true);
			}
			expect(topic.roles.length, topic.id).toBeGreaterThan(0);
		}
	});

	it('points only at screens the app has rules for, and at tours of those screens', () => {
		for (const topic of HELP_TOPICS) {
			if (topic.path) expect(access.ruleForPath(topic.path), topic.path).toBeDefined();
			if (topic.tour) {
				const tour = tourById(topic.tour);
				expect(tour, topic.tour).toBeDefined();
				expect(tour!.path, topic.id).toBe(topic.path);
			}
		}
	});

	it('writes every tour step in both languages', () => {
		for (const tour of TOURS) {
			expect(access.ruleForPath(tour.path), tour.path).toBeDefined();
			for (const step of tour.steps) {
				expect(both(step.title) && both(step.body), `${tour.id}: ${step.target}`).toBe(true);
			}
		}
	});

	it('searches both languages and ignores the bold markup', () => {
		const till = HELP_TOPICS.find((t) => t.id === 'till')!;
		const text = searchText(till);
		expect(text).toContain('open shift');
		expect(text).toContain('ፈረቃ');
		expect(text).not.toContain('**');
	});

	it('finds the articles for a screen, or for the nearest screen above it', () => {
		expect(topicsForPath('/dashboard/items').map((t) => t.id)).toContain('add-item');
		// An item's own page shows the Items articles.
		expect(topicsForPath('/dashboard/items/42').map((t) => t.id)).toContain('add-item');
		expect(topicsForPath('/dashboard/pos/').map((t) => t.id)).toEqual(['till']);
		// The Dashboard's own articles are not handed to every page below it.
		expect(topicsForPath('/dashboard/nothing-here')).toEqual([]);
	});
});
