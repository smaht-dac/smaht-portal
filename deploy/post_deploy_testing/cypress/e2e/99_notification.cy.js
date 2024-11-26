describe('Failing test', () => {
    it('Not an actual error but a trigger for the Slack notifications', function() {
        expect(0).to.equal(1);
    })
});