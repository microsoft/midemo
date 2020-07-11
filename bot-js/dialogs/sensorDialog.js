// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { InputHints } = require('botbuilder');
const { TextPrompt, WaterfallDialog } = require('botbuilder-dialogs');
const { CardFactory } = require('botbuilder-core');
const { ChoiceFactory } = require('botbuilder-choices');
const { CancelAndHelpDialog } = require('./cancelAndHelpDialog');

const request = require('request-promise-native');

const SensorCard = require('../resources/sensorCard.json');

const TEXT_PROMPT = 'textPrompt';
const WATERFALL_DIALOG = 'waterfallDialog';

class SensorDialog extends CancelAndHelpDialog {
    constructor(id) {
        super(id || 'sensorDialog');

        this.addDialog(new TextPrompt(TEXT_PROMPT))
            .addDialog(new WaterfallDialog(WATERFALL_DIALOG, [
                this.initialStep.bind(this),
                this.finalStep.bind(this)
            ]));

        this.initialDialogId = WATERFALL_DIALOG;
    }

    async initialStep(stepContext) {
        const question = stepContext.options.question;
        if (question !== '') {
            const sensor = question.toLowerCase();
            let getSensorMessageText = '',
                tableMsg = '',
                tableKey = '',
                tableRow = '',
                tableSuf = '';
            if (sensor.includes('temp')) {
                tableMsg = 'La temperatura actual es ';
                tableKey = 'iot-devkit';
                tableRow = 'temp';
                tableSuf = '°';
            } else if (sensor.includes('hume')) {
                tableMsg = 'La humedad actual es ';
                tableKey = 'iot-devkit';
                tableRow = 'humi';
                tableSuf = '%';
            } else if (sensor.includes('pers')) {
                tableMsg = 'La cantidad de personas es ';
                tableKey = 'rpi-demo';
                tableRow = 'people';
            } else if (sensor.includes('muje')) {
                tableMsg = 'La cantidad de mujeres es ';
                tableKey = 'rpi-demo';
                tableRow = 'male';
            } else if (sensor.includes('homb')) {
                tableMsg = 'La cantidad de hombres es ';
                tableKey = 'rpi-demo';
                tableRow = 'female';
            } else {
                const activity = stepContext.context.activity;
                const channelId = activity.channelId;
                const fromId = activity.from.id;
                if (channelId === 'directline' && fromId !== 'miDemoBot.co') {
                    const sensorCard = CardFactory.adaptiveCard(SensorCard);
                    return await stepContext.context.sendActivity({ attachments: [sensorCard] });
                } else {
                    const getInitialMessageText = ChoiceFactory.forChannel(stepContext.context, ['Temperatura', 'Humedad', 'Personas', 'Hombres', 'Mujeres'], 'Seleccione un sensor:', 'Seleccione un sensor:');
                    return await stepContext.context.sendActivity(getInitialMessageText, getInitialMessageText, InputHints.IgnoringInput);
                }
            }
            if (tableKey !== '') {
                const tableService = stepContext.options.tableService;
                getSensorMessageText = await this.getTableStorageResult(tableService, tableKey, tableRow, tableMsg, tableSuf);
            }
            return await stepContext.context.sendActivity(getSensorMessageText, getSensorMessageText, InputHints.IgnoringInput);
        }
    }

    /**
     * Complete the interaction and end the dialog.
     */
    async finalStep(stepContext) {
        // const msg = await this.getTranslation(stepContext);
        // await stepContext.context.sendActivity(msg, msg, InputHints.IgnoringInput);
        return await stepContext.endDialog();
    }

    async getTableStorageResult(tableService, tableKey, tableRow, tableMsg, tableSuf) {
        return new Promise((resolve, reject) => {
            let storageResult = 'De momento no estoy monitoreando ningun sensor';
            tableService.retrieveEntity('iothub', tableKey, 'state', function(error, result) {
                if (!error) { storageResult = tableMsg + result[tableRow]._ + tableSuf; }
                resolve(storageResult);
            });
        });
    };

}

module.exports.SensorDialog = SensorDialog;