-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1:3306
-- Generation Time: Jul 03, 2024 at 11:35 AM
-- Server version: 8.3.0
-- PHP Version: 8.1.2-1ubuntu2.18

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `mrimdb2`
--

-- --------------------------------------------------------

--
-- Table structure for table `contact`
--

CREATE TABLE `contact` (
  `id` int NOT NULL,
  `adder_user_id` int NOT NULL,
  `contact_user_id` int NOT NULL,
  `adder_group_id` int NOT NULL,
  `contact_group_id` int DEFAULT NULL,
  `is_auth_success` tinyint(1) NOT NULL DEFAULT '0',
  `adder_nickname` varchar(255) DEFAULT NULL,
  `contact_nickname` varchar(255) DEFAULT NULL,
  `adder_flags` int UNSIGNED NOT NULL DEFAULT '0',
  `contact_flags` int UNSIGNED NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `contact`
--

INSERT INTO `contact` (`id`, `adder_user_id`, `contact_user_id`, `adder_group_id`, `contact_group_id`, `is_auth_success`, `adder_nickname`, `contact_nickname`, `adder_flags`, `contact_flags`) VALUES
(12, 5, 6, 36, 39, 1, 'synzr', 'motionarium', 0, 0),
(14, 5, 4, 36, NULL, 0, NULL, 'veselcraft', 0, 0);

-- --------------------------------------------------------

--
-- Table structure for table `contact_group`
--

CREATE TABLE `contact_group` (
  `id` int NOT NULL,
  `user_id` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `idx` int NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `contact_group`
--

INSERT INTO `contact_group` (`id`, `user_id`, `name`, `idx`) VALUES
(36, 5, 'Group', 0),
(37, 5, 'Group 2', 1),
(38, 4, 'Group', 0),
(39, 6, 'Group', 0);

-- --------------------------------------------------------

--
-- Table structure for table `user`
--

CREATE TABLE `user` (
  `id` int NOT NULL,
  `login` varchar(255) NOT NULL,
  `passwd` varchar(255) NOT NULL,
  `nick` varchar(255) DEFAULT NULL,
  `f_name` varchar(255) DEFAULT NULL,
  `l_name` varchar(255) DEFAULT NULL,
  `location` varchar(255) DEFAULT NULL,
  `birthday` date DEFAULT NULL,
  `zodiac` int DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `sex` enum('1','2') DEFAULT NULL,
  `status` int NOT NULL DEFAULT '0',
  `avatar` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `user`
--

INSERT INTO `user` (`id`, `login`, `passwd`, `nick`, `f_name`, `l_name`, `location`, `birthday`, `zodiac`, `phone`, `sex`, `status`) VALUES
(4, 'veselcraft', 'f423d4e8afac887535717d8335d7c616', 'veselcraft', 'Владимир', 'Баринов', 'Воскресенск', '2004-04-16', NULL, NULL, '1', 1),
(5, 'synzr', '741dd15c5f169ecf90befccb870973bf', 'synzr', 'Михаил', 'Серебряков', 'Магнитогорск', '2007-08-25', NULL, NULL, '1', 1),
(6, 'motionarium', '3005508b38480948959e55aa3fe50d7b', 'motionarium', 'Georgiy', 'Moushenov', NULL, NULL, NULL, NULL, '1', 0);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `contact`
--
ALTER TABLE `contact`
  ADD PRIMARY KEY (`id`),
  ADD KEY `adder_group_id` (`adder_group_id`),
  ADD KEY `contact_group_id` (`contact_group_id`),
  ADD KEY `contact_ibfk_2` (`adder_user_id`),
  ADD KEY `contact_ibfk_4` (`contact_user_id`);

--
-- Indexes for table `contact_group`
--
ALTER TABLE `contact_group`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `user`
--
ALTER TABLE `user`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `login` (`login`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `contact`
--
ALTER TABLE `contact`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=15;

--
-- AUTO_INCREMENT for table `contact_group`
--
ALTER TABLE `contact_group`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=40;

--
-- AUTO_INCREMENT for table `user`
--
ALTER TABLE `user`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `contact`
--
ALTER TABLE `contact`
  ADD CONSTRAINT `contact_ibfk_1` FOREIGN KEY (`adder_group_id`) REFERENCES `contact_group` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `contact_ibfk_2` FOREIGN KEY (`adder_user_id`) REFERENCES `user` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `contact_ibfk_3` FOREIGN KEY (`contact_group_id`) REFERENCES `contact_group` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `contact_ibfk_4` FOREIGN KEY (`contact_user_id`) REFERENCES `user` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

--
-- Constraints for table `contact_group`
--
ALTER TABLE `contact_group`
  ADD CONSTRAINT `contact_group_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
