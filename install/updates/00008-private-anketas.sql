ALTER TABLE `user`
	ADD COLUMN `searchable` INT(11) NOT NULL DEFAULT '1' AFTER `public_status`;
