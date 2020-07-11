// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { ActivityTypes, InputHints } = require('botbuilder');
const { AttachmentPrompt, WaterfallDialog } = require('botbuilder-dialogs');
const { CancelAndHelpDialog } = require('./cancelAndHelpDialog');

const request = require('request-promise-native');

const ATTACHMENT_PROMPT = 'attachmentPrompt';
const WATERFALL_DIALOG = 'waterfallDialog';

class VisionDialog extends CancelAndHelpDialog {
    constructor(id) {
        super(id || 'visionDialog');

        this.addDialog(new AttachmentPrompt(ATTACHMENT_PROMPT))
            .addDialog(new WaterfallDialog(WATERFALL_DIALOG, [
                this.firstStep.bind(this),
                this.finalStep.bind(this)
            ]));

        this.initialDialogId = WATERFALL_DIALOG;
    }

    async firstStep(stepContext) {
        if (stepContext.context.activity.attachments && stepContext.context.activity.attachments.length > 0) {
            return await stepContext.next();
        }
        const promptOptions = { prompt: 'Por favor adjunte la imagen' };
        return await stepContext.prompt(ATTACHMENT_PROMPT, promptOptions);
    }

    /**
     * Complete the interaction and end the dialog.
     */
    async finalStep(stepContext) {
        const attachments = stepContext.context.activity.attachments;
        for await (const file of attachments) {
            let err = "";
            let msg = 'Por favor adjunta una imagen (enviaste: ' + file.contentType + ')';
            let resp = { category: '', caption: '', tags: '' };
            if (file.contentType.includes('image')) {
                const reply = { type: ActivityTypes.Message };
                reply.text = 'Analizando la imagen usando: Computer Vision API...';
                reply.attachments = [file];
                await stepContext.context.sendActivity(reply);
                resp = await this.getComputerVisionResult(stepContext, file);
                if (resp === "InvalidImageUrl") {
                    err = resp;
                    resp = { category: '-', caption: '-', tags: '-' };
                }
                msg = 'Categoría: ' + resp.category + '\n\nDescripción: ' + resp.caption + '\n\nEtiquetas: ' + resp.tags;
            }
            await stepContext.context.sendActivity(msg, msg, InputHints.IgnoringInput);
            if (err === "InvalidImageUrl") {
                break;
            }
            if (resp.category.includes('gente') || resp.tags.includes('persona')) {
                let msg2 = 'Analizando la imagen usando: Face API...';
                await stepContext.context.sendActivity(msg2, msg2, InputHints.IgnoringInput);
                const resp2 = await this.getFaceDetectResult(stepContext, file);
                msg = 'Género: ' + resp2.gender + '\n\nEdad: ' + resp2.age + '\n\nEmoción: ' + resp2.emotion + '\n\nId: ' + resp2.id;
                await stepContext.context.sendActivity(msg, msg, InputHints.IgnoringInput);
                msg2 = 'Identificando a la persona usando: Face API...';
                await stepContext.context.sendActivity(msg2, msg2, InputHints.IgnoringInput);
                msg = await this.getFaceIdentifyResult(stepContext, resp2.id);
                await stepContext.context.sendActivity(msg, msg, InputHints.IgnoringInput);
            } else if (resp.category.includes('planta') || resp.tags.includes('fruta') || resp.tags.includes('comida')) {
                let msg2 = 'Analizando la imagen usando: Custom Vision API (Cafe)...';
                await stepContext.context.sendActivity(msg2, msg2, InputHints.IgnoringInput);
                const resp2 = await this.getCustomVisionResult(stepContext, file);
                msg = 'Café: ' + resp2.cofee.toLocaleString() + '%\n\nVariedad: ' + (resp2.arabica > resp2.robusta ? 'Arabica ' + resp2.arabica.toLocaleString() + '% (Robusta ' + resp2.robusta.toLocaleString() + '%)' : 'Robusta ' + resp2.robusta.toLocaleString() + '% (Arabica ' + resp2.arabica.toLocaleString() + '%)');
                msg = msg + '\n\nEstado: ' + (resp2.tree > resp2.toasted ? 'Arbol ' + resp2.tree.toLocaleString() + '% (Tostado ' + resp2.toasted.toLocaleString() + '%)' : 'Tostado ' + resp2.toasted.toLocaleString() + '% (Arbol ' + resp2.tree.toLocaleString() + '%)');
                await stepContext.context.sendActivity(msg, msg, InputHints.IgnoringInput);
            } else if (resp.tags.includes('alimentos')) {
                let msg2 = 'Analizando la imagen usando: Custom Vision API (Queso)...';
                await stepContext.context.sendActivity(msg2, msg2, InputHints.IgnoringInput);
                const resp2 = await this.getCustomVision2Result(stepContext, file);
                msg = 'Queso: ' + resp2.cheese.toLocaleString() + '%\n\nMarca: ' + (resp2.brand1 > resp2.brand2 ? 'Alpina ' + resp2.brand1.toLocaleString() + '% (Colanta ' + resp2.brand2.toLocaleString() + '%)' : 'Colanta ' + resp2.brand2.toLocaleString() + '% (Alpina ' + resp2.brand1.toLocaleString() + '%)');
                msg = msg + '\n\nTipo:\n\nCampesino - ' + resp2.type1.toLocaleString() + '% \n\nMozarella - ' + resp2.type2.toLocaleString() + '% \n\nParmesano - ' + resp2.type3.toLocaleString() + '% \n\nQuesito - ' + resp2.type4.toLocaleString() + '% \n\nSabana - ' + resp2.type5.toLocaleString() + '%';
                await stepContext.context.sendActivity(msg, msg, InputHints.IgnoringInput);
            }
        }
        return await stepContext.endDialog();
    }

    async getComputerVisionResult(stepContext, file) {
        return new Promise((resolve, reject) => {
            const extraConfig = stepContext.options;
            const params = 'visualFeatures=Categories,Description&language=es';
            const body = {
                'url': file.contentUrl // 'https://sc01.alicdn.com/kf/UTB82NebfFfJXKJkSamHq6zLyVXa3/Brazil-Nice-Quality-Bulk-Roasted-Arabica-Coffee.jpg_350x350.jpg' 
            };
            const optsMsg = {
                method: 'POST',
                uri: extraConfig.ComputerVisionEndpoint + '/vision/v2.1/analyze' + '?' + params,
                headers: {
                    'Ocp-Apim-Subscription-Key': extraConfig.ComputerVisionApiKey
                },
                body,
                json: true
            };
            request(optsMsg)
                .then(function(data) {
                    let category = '-';
                    let tags = '-';
                    let caption = '-';
                    if (data.categories) {
                        category = data.categories[0].name;
                    }
                    if (data.description) {
                        if (data.description.tags) {
                            tags = data.description.tags;
                        }
                        if (data.description.captions) {
                            if (data.description.captions.length > 0) {
                                caption = data.description.captions[0].text;
                            }
                        }
                    }
                    resolve({ category, caption, tags });
                })
                .catch(function(err) {
                    resolve(err.error.code);
                    // resolve('No fue posible realizar la traducción, por favor intente nuevamente.');
                });
        });
    };

    async getCustomVisionResult(stepContext, file) {
        return new Promise((resolve, reject) => {
            const extraConfig = stepContext.options;
            const body = {
                'url': file.contentUrl // 'https://sc01.alicdn.com/kf/UTB82NebfFfJXKJkSamHq6zLyVXa3/Brazil-Nice-Quality-Bulk-Roasted-Arabica-Coffee.jpg_350x350.jpg' 
            };
            const optsMsg = {
                method: 'POST',
                uri: extraConfig.CustomVisionEndpoint + '/classify/iterations/cafe/url',
                headers: {
                    'Prediction-Key': extraConfig.CustomVisionApiKey
                },
                body,
                json: true
            };
            request(optsMsg)
                .then(function(data) {
                    let cofee = 0
                    let tree = 0
                    let toasted = 0
                    let arabica = 0
                    let robusta = 0
                    for (const prediction of data.predictions) {
                        const prob = Math.round(prediction.probability * 10000) / 100;
                        if (prediction.tagName === "cafe") {
                            cofee = prob;
                        } else if (prediction.tagName === "arbol") {
                            tree = prob;
                        } else if (prediction.tagName === "tostado") {
                            toasted = prob;
                        } else if (prediction.tagName === "arabica") {
                            arabica = prob;
                        } else if (prediction.tagName === "robusta") {
                            robusta = prob;
                        }
                    }
                    resolve({ cofee, tree, toasted, arabica, robusta });
                })
                .catch(function(err) {
                    resolve(err.message);
                    // resolve('No fue posible realizar la traducción, por favor intente nuevamente.');
                });
        });
    };

    async getCustomVision2Result(stepContext, file) {
        return new Promise((resolve, reject) => {
            const extraConfig = stepContext.options;
            const body = {
                'url': file.contentUrl // 'https://sc01.alicdn.com/kf/UTB82NebfFfJXKJkSamHq6zLyVXa3/Brazil-Nice-Quality-Bulk-Roasted-Arabica-Coffee.jpg_350x350.jpg' 
            };
            const optsMsg = {
                method: 'POST',
                uri: extraConfig.CustomVisionEndpoint2 + '/classify/iterations/queso/url',
                headers: {
                    'Prediction-Key': extraConfig.CustomVisionApiKey
                },
                body,
                json: true
            };
            request(optsMsg)
                .then(function(data) {
                    let cheese = 0
                    let brand1 = 0
                    let brand2 = 0
                    let type1 = 0
                    let type2 = 0
                    let type3 = 0
                    let type4 = 0
                    let type5 = 0
                    for (const prediction of data.predictions) {
                        const prob = Math.round(prediction.probability * 10000) / 100;
                        if (prediction.tagName === "queso") {
                            cheese = prob;
                        } else if (prediction.tagName === "alpina") {
                            brand1 = prob;
                        } else if (prediction.tagName === "colanta") {
                            brand2 = prob;
                        } else if (prediction.tagName === "campesino") {
                            type1 = prob;
                        } else if (prediction.tagName === "mozarella") {
                            type2 = prob;
                        } else if (prediction.tagName === "parmesano") {
                            type3 = prob;
                        } else if (prediction.tagName === "quesito") {
                            type4 = prob;
                        } else if (prediction.tagName === "parmesano") {
                            type5 = prob;
                        }
                    }
                    resolve({ cheese, brand1, brand2, type1, type2, type3, type4, type5 });
                })
                .catch(function(err) {
                    resolve(err.message);
                    // resolve('No fue posible realizar la traducción, por favor intente nuevamente.');
                });
        });
    };

    async getFaceDetectResult(stepContext, file) {
        return new Promise((resolve, reject) => {
            const extraConfig = stepContext.options;
            const params = 'returnFaceId=true&returnFaceAttributes=age,gender,emotion';
            const body = {
                'url': file.contentUrl
                    // 'https://www.marieclaire.com.mx/wp-content/uploads/2018/06/Artista-digital-causa-furor-al-combinar-las-caras-m%C3%A1s-famosas-de-Hollywood-1024x552.jpg' //
            };
            const optsMsg = {
                method: 'POST',
                uri: extraConfig.FaceEndpoint + '/detect?' + params,
                headers: {
                    'Ocp-Apim-Subscription-Key': extraConfig.FaceApiKey
                },
                body,
                json: true
            };
            request(optsMsg)
                .then(function(data) {
                    let id = '-';
                    let gender = '-';
                    let age = '-';
                    let emotion = '-';
                    const attribs = data[0].faceAttributes;
                    if (attribs) {
                        id = data[0].faceId;
                        gender = (attribs.gender === 'male' ? 'hombre' : 'mujer');
                        age = attribs.age;
                        if (attribs.emotion.surprise > 0.5) {
                            emotion = 'negativa';
                        } else if (attribs.emotion.disgust > 0.5) {
                            emotion = 'negativa';
                        } else if (attribs.emotion.neutral > 0.5) {
                            emotion = 'neutral';
                        } else if (attribs.emotion.contempt > 0.5) {
                            emotion = 'negativa';
                        } else if (attribs.emotion.fear > 0.5) {
                            emotion = 'negativa';
                        } else if (attribs.emotion.happiness > 0.5) {
                            emotion = 'positiva';
                        } else if (attribs.emotion.sadness > 0.5) {
                            emotion = 'negativa';
                        } else if (attribs.emotion.anger > 0.5) {
                            emotion = 'negativa';
                        }
                    }
                    resolve({ id, gender, age, emotion });
                })
                .catch(function(err) {
                    resolve(err.message);
                    // resolve('No fue posible realizar la traducción, por favor intente nuevamente.');
                });
        });
    };

    async getFaceIdentifyResult(stepContext, id) {
        return new Promise((resolve, reject) => {
            const extraConfig = stepContext.options;
            const body = {
                'personGroupId': extraConfig.FaceGroupId,
                'faceIds': [id],
            };
            const optsMsg = {
                method: 'POST',
                uri: extraConfig.FaceEndpoint + '/identify',
                headers: {
                    'Ocp-Apim-Subscription-Key': extraConfig.FaceApiKey
                },
                body,
                json: true
            };
            request(optsMsg)
                .then(function(data) {
                    let resp = 'Persona no identificada';
                    const personId = extraConfig.FacePersonId;
                    const faceId = data[0];
                    if (faceId && faceId.candidates.length > 0) {
                        const canditate = faceId.candidates[0];
                        if (canditate.personId === personId && canditate.confidence > 0.5) {
                            resp = 'Persona Identificada: Fernando'
                        }
                    }
                    resolve(resp);
                })
                .catch(function(err) {
                    resolve(err.message);
                });
        });
    };

}

module.exports.VisionDialog = VisionDialog;