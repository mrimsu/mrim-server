CREATE TABLE `virtual_numbers` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `phone` VARCHAR(255) DEFAULT NULL,
  `telegram_id` VARCHAR(255) NOT NULL,
  `in_use` ENUM('0', '1') NOT NULL DEFAULT '1',
  CONSTRAINT `fk_virtual_numbers_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=UTF8MB4;

ALTER TABLE `user` DROP COLUMN `phone`;
