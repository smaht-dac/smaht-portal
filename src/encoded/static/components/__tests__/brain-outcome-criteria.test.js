import { parseOutcomeCriteria } from '../browse/browse-view/brain-outcome-criteria';

describe('parseOutcomeCriteria', () => {
    test('splits the outcome description into its opening sentence and numbered reasons', () => {
        const description =
            'Pathology report outcome: A sample is unacceptable if any of the following apply: ' +
            '(i) target tissues comprise <10% of the tissue on the slide; (ii) the overall autolysis ' +
            'score is 3; or (iii) a significant unexpected pathological finding is present.';
        expect(parseOutcomeCriteria(description)).toEqual({
            intro: 'A sample is unacceptable if any of the following apply:',
            reasons: [
                'target tissues comprise <10% of the tissue on the slide',
                'the overall autolysis score is 3',
                'a significant unexpected pathological finding is present',
            ],
        });
    });

    test('keeps a description with no (i)/(ii) reasons as plain text', () => {
        expect(parseOutcomeCriteria('Pathology report outcome: Acceptable or not.')).toEqual({
            intro: 'Acceptable or not.',
            reasons: [],
        });
    });

    test('no description, no criteria', () => {
        expect(parseOutcomeCriteria(undefined)).toBeNull();
    });
});
