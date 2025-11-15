ALTER TABLE `user`
	ADD COLUMN `domain` VARCHAR(255) NOT NULL DEFAULT 'mail.ru' AFTER `passwd`;
