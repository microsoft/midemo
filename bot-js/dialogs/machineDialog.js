// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { InputHints } = require('botbuilder');
const { ChoiceFactory } = require('botbuilder-choices');
const { ChoicePrompt, NumberPrompt, WaterfallDialog } = require('botbuilder-dialogs');
const { CancelAndHelpDialog } = require('./cancelAndHelpDialog');

const request = require('request-promise-native');

const CHOICE_PROMPT = 'ChoicePrompt';
const NUMBER_PROMPT = 'numberPrompt';
const WATERFALL_DIALOG = 'waterfallDialog';

class MachineDialog extends CancelAndHelpDialog {
    constructor(id) {
        super(id || 'machineDialog');

        this.addDialog(new ChoicePrompt(CHOICE_PROMPT))
            .addDialog(new NumberPrompt(NUMBER_PROMPT, this.numberValidator))
            .addDialog(new WaterfallDialog(WATERFALL_DIALOG, [
                this.firstStep.bind(this),
                this.secondStep.bind(this),
                this.thirdStep.bind(this),
                this.finalStep.bind(this)
            ]));

        this.initialDialogId = WATERFALL_DIALOG;
    }

    async numberValidator(stepContext) {
        if (!stepContext.recognized.succeeded) return false;
        const question = stepContext.options.prompt;
        const response = stepContext.recognized.value;
        if (question.includes('edad')) {
            if (response >= 16 && response <= 90) return true;
        } else if (question.includes('estudio')) {
            if (response >= 0 && response <= 25) return true;
        }
        return false;
    }

    async firstStep(stepContext) {
        const promptOptions = { prompt: 'Indiqueme su edad en años:', retryPrompt: 'Solamente analizo rango de edad entre 16 y 90 años, por favor intente nuevamente.' };
        return await stepContext.prompt(NUMBER_PROMPT, promptOptions);
    }

    async secondStep(stepContext) {
        stepContext.values.age = stepContext.result;
        const promptOptions = { prompt: 'Indiqueme sus años de estudio (incluyendo Colegio):', retryPrompt: 'Solamente analizo rango de estudio entre 0 y 25 años, por favor intente nuevamente.' };
        return await stepContext.prompt(NUMBER_PROMPT, promptOptions);
    }

    async thirdStep(stepContext) {
        stepContext.values.education = stepContext.result;
        return await stepContext.prompt(CHOICE_PROMPT, { prompt: 'Indiqueme su género:', choices: ChoiceFactory.toChoices(['Mujer', 'Hombre', 'N/D']) });
    }

    /**
     * Complete the interaction and end the dialog.
     */
    async finalStep(stepContext) {
        const result = stepContext.result.value.toLowerCase();
        const sex = (result.includes('muj') ? 'Female' : (result.includes('homb') ? 'Male' : ''));
        stepContext.values.sex = sex;
        const msg = await this.getMLResult(stepContext);
        await stepContext.context.sendActivity(msg, msg, InputHints.IgnoringInput);
        return await stepContext.endDialog();
    }

    async getMLResult(stepContext) {
        return new Promise((resolve, reject) => {
            const extraConfig = stepContext.options;
            const values = stepContext.values;
            const body = {
                "Inputs": {
                    "Entrada": [{
                        "age": values.age,
                        "workclass": "",
                        "fnlwgt": "",
                        "education": "",
                        "education-num": values.education,
                        "marital-status": "",
                        "occupation": "",
                        "relationship": "",
                        "race": "",
                        "sex": values.sex,
                        "capital-gain": "",
                        "capital-loss": "",
                        "hours-per-week": "",
                        "native-country": "-States",
                        "income": ""
                    }]
                },
                "GlobalParameters": {}
            };
            const optsMsg = {
                method: 'POST',
                uri: extraConfig.MLApiUrl,
                headers: {
                    'Authorization': 'Bearer ' + extraConfig.MLApiKey
                },
                body,
                json: true
            };
            request(optsMsg)
                .then(function(data) {
                    const result = data.Results.Salida;
                    if (result) {
                        result.forEach(score => {
                            resolve(Math.round(score['Scored Probabilities'] * 100) + '% probable que gane mas de USD 50k/año');
                        });
                    } else {
                        resolve('No fue posible realizar la traducción, por favor intente nuevamente.');
                    }
                })
                .catch(function(err) {
                    resolve('No fue posible realizar la traducción, por favor intente nuevamente.');
                });
        });
    };
}

module.exports.MachineDialog = MachineDialog;