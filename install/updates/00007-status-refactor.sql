ALTER TABLE `user`
	CHANGE COLUMN `status` `public_status` INT(11) NOT NULL DEFAULT '0' AFTER `sex`;
