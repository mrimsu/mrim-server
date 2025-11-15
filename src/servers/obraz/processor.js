/**
 * @file Реализация процессор фотокарточек образов
 * @author mikhail "synzr" <mikhail@tskau.team>
 */

const sharp = require('sharp')

const AVATAR_METADATAS = {
  _mrimavatar: { size: 90, format: 'jpeg', quality: 90 },
  _mrimavatarsmall: { size: 45, format: 'jpeg', quality: 90 },
  _mrimavatar180: { size: 180, format: 'jpeg', quality: 90 },
  _mrimavatar128: { size: 128, format: 'jpeg', quality: 90 },
  _mrimavatar60: { size: 60, format: 'jpeg', quality: 90 },
  _mrimavatar32: { size: 32, format: 'jpeg', quality: 90 },
  _mrimavatar22: { size: 22, format: 'jpeg', quality: 90 }
}

/**
 * Обрезание и центрирование изображение до квадратного размера.
 *
 * @param {sharp.Sharp} image Изображения
 * @param {number} imageWidth Ширина изображения
 * @param {number} imageHeight Высота изображения
 *
 * @returns {Promise<sharp.Sharp>} Квадратное изображение
 */
async function resizeImage (image, imageWidth, imageHeight) {
  const resizeOptions = {
    width: imageWidth,
    height: imageHeight,
    fit: "outside"
  } 

  return await image.resize(resizeOptions)
}

/**
 * Обработка изображения для конкретного типа аватара.
 *
 * @param {string} absolutePath Абсолютный путь к изображению
 * @param {string} outputType Тип обработки изображения
 *
 * @returns {Promise<Buffer>} Обработанное изображение
 */
async function processAvatar (absolutePath, outputType) {
  const metadata = Object.keys(AVATAR_METADATAS).includes(outputType)
    ? AVATAR_METADATAS[outputType]
    : AVATAR_METADATAS._mrimavatar

  let avatar = sharp(absolutePath)
  const {
    width: avatarWidth,
    height: avatarHeight
  } = await avatar.metadata()

  if (avatarWidth !== avatarHeight) {
    avatar = await resizeImage(avatar, avatarWidth, avatarHeight)
  }

  return await avatar
    .resize({ width: metadata.size, height: metadata.height })
    .toFormat(metadata.format, {
      quality: metadata.quality
    })
    .toBuffer()
}

module.exports = { processAvatar }
