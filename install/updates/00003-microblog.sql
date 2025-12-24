ALTER TABLE `user`
	ADD COLUMN `microblog_settings` JSON NULL DEFAULT '{}' AFTER `avatar`;

