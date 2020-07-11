// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { ActivityTypes, InputHints } = require('botbuilder');
const { ChoicePrompt, OAuthPrompt, TextPrompt, WaterfallDialog } = require('botbuilder-dialogs');
const { ChoiceFactory } = require('botbuilder-choices');

const fs = require('fs');
const path = require('path');

const { SimpleGraphClient } = require('../clients/simple-graph-client');

const { CancelAndHelpDialog } = require('./cancelAndHelpDialog');

const CHOICE_PROMPT = 'ChoicePrompt';
const TEXT_PROMPT = 'TextPrompt';
const OAUTH_PROMPT = 'oAuthPrompt';
const WATERFALL_DIALOG = 'waterfallDialog';

class CertificateDialog extends CancelAndHelpDialog {
    constructor(id) {
        super(id || 'certificateDialog');

        this.addDialog(new ChoicePrompt(CHOICE_PROMPT));
        this.addDialog(new TextPrompt(TEXT_PROMPT));
        this.addDialog(new OAuthPrompt(OAUTH_PROMPT, {
            connectionName: process.env.ConnectionName,
            text: 'Por favor ingrese a continuación con sus credenciales y escriba el token generado',
            title: 'Ingresar y generar token',
            timeout: 300000
        }));
        this.addDialog(new WaterfallDialog(WATERFALL_DIALOG, [
            this.promptStep.bind(this),
            this.loginStep.bind(this),
            this.firstStep.bind(this),
            this.finalStep.bind(this)
        ]));

        this.initialDialogId = WATERFALL_DIALOG;
    }

    async promptStep(stepContext) {
        return stepContext.beginDialog(OAUTH_PROMPT);
    }

    async loginStep(stepContext) {
        // Get the token from the previous step. Note that we could also have gotten the
        // token directly from the prompt itself. There is an example of this in the next method.
        const tokenResponse = stepContext.result;
        if (tokenResponse) {
            const client = new SimpleGraphClient(tokenResponse.token);
            const me = await client.getMe();
            await stepContext.context.sendActivity('Ingreso exitoso, bienvenida(o) ' + me.displayName);
            return await stepContext.next();
        } else {
            await stepContext.context.sendActivity('No pudo ingresar exitosamente, intente nuevamente.');
            return await stepContext.endDialog();
        }
    }

    async firstStep(stepContext) {
        // const getChoiceMessageText = ChoiceFactory.forChannel(stepContext.context, ['Nómina', 'Ingresos'], '¿Qué certificado requiere?', '¿Qué certificado requiere?');
        return await stepContext.prompt(CHOICE_PROMPT, { prompt: '¿Qué certificado requiere?', choices: ChoiceFactory.toChoices(['Nomina', 'Ingresos']) });
    }

    /**
     * Complete the interaction and end the dialog.
     */
    async finalStep(stepContext) {
        const cert = stepContext.result.value;
        let msg = 'Sólamente puedo enviar certificados de nómina o de ingresos';
        if (cert.toLowerCase().includes('nomi') || cert.toLowerCase().includes('ingre')) {
            msg = 'Enviando certificado de ' + cert;
            const reply = { type: ActivityTypes.Message };
            reply.text = msg;
            reply.attachments = [this.getInlineAttachment(cert.toLowerCase())];
            await stepContext.context.sendActivity(reply);
        } else {
            await stepContext.context.sendActivity(msg, msg, InputHints.IgnoringInput);
        }
        return await stepContext.endDialog();
    }

    getInlineAttachment(cert) {
        const file = fs.readFileSync(path.join(__dirname, '../resources/cert-' + cert + '.pdf'));
        const base64File = Buffer.from(file).toString('base64');

        return {
            name: 'cert-' + cert + '.pdf',
            contentType: 'application/pdf',
            contentUrl: 'data:application/pdf;base64,' + base64File
        };
    }
}

module.exports.CertificateDialog = CertificateDialog;